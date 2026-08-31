package app.plna.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast

/**
 * 위젯을 홈 화면에 놓을 때 뜨는 설정 화면.
 * 주소와 토큰 두 개를 받아 기기에 저장한다. 값은 위젯 전체가 공유한다.
 */
class ConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 설정을 마치지 않고 나가면 위젯이 놓이지 않아야 한다.
        setResult(RESULT_CANCELED)
        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        setContentView(R.layout.activity_config)

        val baseUrl = findViewById<EditText>(R.id.input_base_url)
        val readToken = findViewById<EditText>(R.id.input_read_token)
        val writeToken = findViewById<EditText>(R.id.input_write_token)

        val saved = ConfigStore.load(this)
        baseUrl.setText(saved.baseUrl.ifBlank { ConfigStore.DEFAULT_BASE_URL })
        readToken.setText(saved.readToken)
        writeToken.setText(saved.writeToken)

        findViewById<Button>(R.id.button_save).setOnClickListener {
            val config = PlnaConfig(
                baseUrl = baseUrl.text.toString(),
                readToken = readToken.text.toString(),
                writeToken = writeToken.text.toString(),
            )
            if (!config.isComplete) {
                Toast.makeText(this, R.string.config_incomplete, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            ConfigStore.save(this, config)
            HabitWidgetProvider.refresh(applicationContext)

            setResult(
                RESULT_OK,
                Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
            )
            finish()
        }
    }
}
