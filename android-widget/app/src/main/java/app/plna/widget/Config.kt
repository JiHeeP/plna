package app.plna.widget

import android.content.Context

/**
 * 위젯이 서버에 붙는 데 필요한 값. 위젯을 홈 화면에 놓을 때 한 번 입력하고,
 * 그 뒤로는 기기 안에만 저장된다.
 *
 * 읽기 토큰과 쓰기 토큰을 나눠 받는다. 서버가 목록 조회에는 읽기 토큰을,
 * 체크 변경에는 쓰기 토큰을 요구하기 때문이다.
 */
data class PlnaConfig(
    val baseUrl: String,
    val readToken: String,
    val writeToken: String,
) {
    val isComplete: Boolean
        get() = baseUrl.isNotBlank() && readToken.isNotBlank() && writeToken.isNotBlank()

    /** 끝의 `/` 유무와 상관없이 같은 주소가 되도록 정리한다. */
    fun endpoint(path: String): String = baseUrl.trimEnd('/') + path
}

object ConfigStore {
    private const val PREFS = "plna_widget"
    private const val KEY_BASE_URL = "base_url"
    private const val KEY_READ_TOKEN = "read_token"
    private const val KEY_WRITE_TOKEN = "write_token"

    const val DEFAULT_BASE_URL = "https://plna.vercel.app"

    fun load(context: Context): PlnaConfig {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return PlnaConfig(
            baseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL).orEmpty(),
            readToken = prefs.getString(KEY_READ_TOKEN, "").orEmpty(),
            writeToken = prefs.getString(KEY_WRITE_TOKEN, "").orEmpty(),
        )
    }

    fun save(context: Context, config: PlnaConfig) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BASE_URL, config.baseUrl.trim())
            .putString(KEY_READ_TOKEN, config.readToken.trim())
            .putString(KEY_WRITE_TOKEN, config.writeToken.trim())
            .apply()
    }
}
