# PLNA 위젯 창을 바탕화면에 상시 고정한다 (Windows, 설치 불필요)
#
# 하는 일:
#   1. 크롬을 앱 모드(--app)로 띄운다. 주소창도 탭도 없는 창이 나온다.
#   2. Win32 SetWindowPos 로 그 창을 "항상 위"로 만들고 위치·크기를 잡는다.
#
# 창을 닫으면 고정도 사라진다. 다시 쓰려면 이 스크립트를 다시 실행하면 되고,
# 로그인할 때마다 자동으로 띄우려면 README 의 "시작프로그램 등록" 참고.

param(
    [string]$Url    = 'https://plna.vercel.app/widget',
    [int]$X         = 40,      # 화면 왼쪽에서의 위치(px)
    [int]$Y         = 40,      # 화면 위쪽에서의 위치(px)
    [int]$Width     = 420,
    [int]$Height    = 620,
    [string]$Title  = 'PLNA'   # 창 제목에서 찾을 문자열
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class PlnaWin {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

    // 제목에 needle 이 들어간 보이는 창들을 (핸들, 제목) 으로 돌려준다.
    public static List<string> FindWindows(string needle) {
        var found = new List<string>();
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h)) return true;
            int len = GetWindowTextLength(h);
            if (len == 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(h, sb, sb.Capacity);
            string title = sb.ToString();
            if (title.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) {
                found.Add(h.ToInt64() + "|" + title);
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static bool PinTopmost(long handle, int x, int y, int w, int h) {
        // HWND_TOPMOST = -1, SWP_SHOWWINDOW = 0x0040
        return SetWindowPos(new IntPtr(handle), new IntPtr(-1), x, y, w, h, 0x0040);
    }
}
"@

# --- 1. 크롬 찾기 ---------------------------------------------------------
$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
    Write-Host '크롬을 찾지 못했습니다. 설치 경로를 확인하세요.' -ForegroundColor Red
    exit 1
}

# --- 2. 이미 떠 있으면 재사용, 아니면 새로 띄운다 -------------------------
function Get-WidgetWindow {
    $all = [PlnaWin]::FindWindows($Title)
    # 앱 모드 창은 제목에 "Chrome" 이 붙지 않는다. 일반 브라우저 탭과 구분한다.
    $app = $all | Where-Object { $_ -notmatch 'Chrome' } | Select-Object -First 1
    if (-not $app) { $app = $all | Select-Object -First 1 }
    return $app
}

if (-not (Get-WidgetWindow)) {
    Start-Process -FilePath $chrome -ArgumentList "--app=$Url"
}

$window = $null
foreach ($attempt in 1..25) {
    Start-Sleep -Milliseconds 400
    $window = Get-WidgetWindow
    if ($window) { break }
}

if (-not $window) {
    Write-Host '위젯 창을 찾지 못했습니다. 창이 열렸는지 확인하세요.' -ForegroundColor Red
    exit 1
}

# --- 3. 항상 위로 고정 ----------------------------------------------------
$parts  = $window -split '\|', 2
$handle = [int64]$parts[0]

if ([PlnaWin]::PinTopmost($handle, $X, $Y, $Width, $Height)) {
    Write-Host "고정 완료: $($parts[1])" -ForegroundColor Green
    Write-Host "위치 ${X},${Y}  크기 ${Width}x${Height}"
} else {
    Write-Host '고정에 실패했습니다.' -ForegroundColor Red
    exit 1
}
