package app.plna.widget

import android.util.Log
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * `/api/widget/habits` 하나만 쓰는 아주 작은 클라이언트.
 * 모든 호출은 네트워크를 타므로 반드시 배경 스레드에서 부른다.
 */
object PlnaApi {
    private const val TAG = "PlnaApi"
    private const val TIMEOUT_MS = 15_000

    data class Habit(val id: String, val name: String, val completed: Boolean)

    data class Snapshot(val date: String, val habits: List<Habit>) {
        val done: Int get() = habits.count { it.completed }
    }

    /** 오늘의 습관 목록과 체크 상태. 실패하면 null 을 돌려주고 위젯은 이전 화면을 유지한다. */
    fun fetchHabits(config: PlnaConfig): Snapshot? {
        if (!config.isComplete) return null
        return try {
            val connection = open(config.endpoint("/api/widget/habits"), "GET", config.readToken)
            val snapshot = connection.readJson()?.let { json ->
                val array = json.optJSONArray("habits") ?: JSONArray()
                val habits = (0 until array.length()).map { index ->
                    val item = array.getJSONObject(index)
                    Habit(
                        id = item.optString("id"),
                        name = item.optString("name"),
                        completed = item.optBoolean("completed"),
                    )
                }
                Snapshot(date = json.optString("date"), habits = habits)
            }
            connection.disconnect()
            snapshot
        } catch (error: Exception) {
            Log.w(TAG, "습관 목록을 불러오지 못했습니다", error)
            null
        }
    }

    /** 습관 하나의 체크 상태를 바꾼다. 성공 여부만 돌려준다. */
    fun toggleHabit(config: PlnaConfig, habitId: String, date: String, completed: Boolean): Boolean {
        if (!config.isComplete) return false
        return try {
            val connection = open(config.endpoint("/api/widget/habits"), "POST", config.writeToken)
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            val body = JSONObject()
                .put("habit_id", habitId)
                .put("completed", completed)
                .apply { if (date.isNotBlank()) put("date", date) }
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            val ok = connection.responseCode in 200..299
            if (!ok) Log.w(TAG, "체크 변경 실패: HTTP ${connection.responseCode}")
            connection.disconnect()
            ok
        } catch (error: Exception) {
            Log.w(TAG, "체크를 저장하지 못했습니다", error)
            false
        }
    }

    private fun open(url: String, method: String, token: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            // 토큰은 헤더로 보낸다. 주소에 넣으면 CDN 캐시와 로그에 그대로 남는다.
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/json")
        }

    private fun HttpURLConnection.readJson(): JSONObject? {
        if (responseCode !in 200..299) {
            Log.w(TAG, "HTTP $responseCode ${errorStream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()}")
            return null
        }
        val text = inputStream.bufferedReader().use(BufferedReader::readText)
        return JSONObject(text)
    }
}
