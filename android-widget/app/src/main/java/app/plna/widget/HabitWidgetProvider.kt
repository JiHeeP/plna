package app.plna.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.util.concurrent.Executors

/**
 * 홈 화면 위젯 본체.
 *
 * 목록 자체는 [HabitRemoteViewsService] 가 채우고, 이 클래스는 머리말(날짜·진행률)과
 * 줄을 눌렀을 때의 동작을 맡는다. 줄을 누르면 서버에 체크를 저장하고 목록을 다시 읽는다.
 */
class HabitWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { render(context, manager, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE -> {
                val habitId = intent.getStringExtra(EXTRA_HABIT_ID).orEmpty()
                val date = intent.getStringExtra(EXTRA_DATE).orEmpty()
                // 지금 화면에 그려진 상태의 반대로 뒤집는다.
                val next = !intent.getBooleanExtra(EXTRA_COMPLETED, false)
                if (habitId.isNotBlank()) toggle(context, habitId, date, next)
            }
            ACTION_REFRESH -> refresh(context)
            else -> Unit
        }
        super.onReceive(context, intent)
    }

    private fun toggle(context: Context, habitId: String, date: String, completed: Boolean) {
        val appContext = context.applicationContext
        val pending = goAsync()
        worker.execute {
            try {
                PlnaApi.toggleHabit(ConfigStore.load(appContext), habitId, date, completed)
            } finally {
                // 성공이든 실패든 서버 상태를 다시 읽어 화면과 어긋나지 않게 한다.
                refresh(appContext)
                pending.finish()
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE = "app.plna.widget.action.TOGGLE"
        const val ACTION_REFRESH = "app.plna.widget.action.REFRESH"
        const val EXTRA_HABIT_ID = "habit_id"
        const val EXTRA_DATE = "date"
        const val EXTRA_COMPLETED = "completed"

        private val worker = Executors.newSingleThreadExecutor()

        fun widgetIds(context: Context): IntArray =
            AppWidgetManager.getInstance(context)
                .getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))

        /** 목록을 다시 읽게 하고 머리말도 새로 그린다. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = widgetIds(context)
            if (ids.isEmpty()) return
            manager.notifyAppWidgetViewDataChanged(ids, R.id.habit_list)
            ids.forEach { render(context, manager, it) }
        }

        fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_habits)
            val config = ConfigStore.load(context)

            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_label))
            views.setTextViewText(R.id.widget_status, HabitStatus.read(context))
            views.setEmptyView(R.id.habit_list, R.id.widget_empty)
            views.setTextViewText(
                R.id.widget_empty,
                context.getString(
                    if (config.isComplete) R.string.empty_habits else R.string.empty_not_configured,
                ),
            )

            // 목록을 채우는 서비스. 위젯마다 다른 데이터를 갖도록 id 를 URI 에 넣는다.
            val listIntent = Intent(context, HabitRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.habit_list, listIntent)

            // 줄 하나를 누르면 채워지는 틀. 나머지 값은 각 줄이 채운다.
            val template = Intent(context, HabitWidgetProvider::class.java).apply {
                action = ACTION_TOGGLE
            }
            views.setPendingIntentTemplate(
                R.id.habit_list,
                PendingIntent.getBroadcast(
                    context,
                    widgetId,
                    template,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                ),
            )

            val refreshIntent = Intent(context, HabitWidgetProvider::class.java).apply {
                action = ACTION_REFRESH
            }
            views.setOnClickPendingIntent(
                R.id.widget_refresh,
                PendingIntent.getBroadcast(
                    context,
                    widgetId,
                    refreshIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            manager.updateAppWidget(widgetId, views)
        }
    }
}

/**
 * 머리말에 쓸 "3/7 · 8월 31일" 같은 한 줄.
 * 목록을 읽는 쪽([HabitRemoteViewsService])과 머리말을 그리는 쪽이 서로 다른 프로세스 진입점이라,
 * 마지막으로 읽은 값을 여기에 적어 두고 공유한다.
 */
object HabitStatus {
    private const val PREFS = "plna_widget_status"
    private const val KEY = "summary"

    fun write(context: Context, summary: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, summary).apply()
    }

    fun read(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "").orEmpty()
}
