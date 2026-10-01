package app.plna.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** 위젯 목록의 각 줄을 만들어 주는 서비스. 런처가 이 서비스에 붙어 목록을 그린다. */
class HabitRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        HabitViewsFactory(applicationContext)
}

private class HabitViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var snapshot: PlnaApi.Snapshot? = null

    override fun onCreate() = Unit

    /**
     * 런처가 배경 스레드에서 부르므로 여기서 바로 네트워크를 탄다.
     * 실패하면 이전에 읽은 목록을 그대로 두어 화면이 비지 않게 한다.
     */
    override fun onDataSetChanged() {
        val config = ConfigStore.load(context)
        val fresh = PlnaApi.fetchHabits(config)
        if (fresh != null) {
            snapshot = fresh
            HabitStatus.write(context, "${fresh.done}/${fresh.habits.size} · ${fresh.date}")
        } else if (!config.isComplete) {
            snapshot = null
            HabitStatus.write(context, "")
        }
    }

    override fun onDestroy() {
        snapshot = null
    }

    override fun getCount(): Int = snapshot?.habits?.size ?: 0

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_habit_row)
        val habit = snapshot?.habits?.getOrNull(position)
            ?: return views

        views.setTextViewText(R.id.row_check, context.getString(
            if (habit.completed) R.string.glyph_checked else R.string.glyph_unchecked,
        ))
        views.setTextViewText(R.id.row_name, habit.name)
        views.setTextColor(
            R.id.row_name,
            context.getColor(if (habit.completed) R.color.widget_muted else R.color.widget_text),
        )

        // 이 줄을 누르면 위젯 provider 의 틀에 이 값들이 채워져 브로드캐스트된다.
        views.setOnClickFillInIntent(
            R.id.row_root,
            Intent().apply {
                putExtra(HabitWidgetProvider.EXTRA_HABIT_ID, habit.id)
                putExtra(HabitWidgetProvider.EXTRA_COMPLETED, habit.completed)
                putExtra(HabitWidgetProvider.EXTRA_DATE, snapshot?.date.orEmpty())
            },
        )
        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long =
        snapshot?.habits?.getOrNull(position)?.id?.hashCode()?.toLong() ?: position.toLong()

    override fun hasStableIds(): Boolean = true
}
