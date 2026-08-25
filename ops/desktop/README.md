# PLNA 위젯 창 상시 고정 (Windows)

`/widget` 화면을 주소창 없는 창으로 띄우고, **항상 다른 창 위에** 머무르게 한다.
설치할 프로그램은 없다. 크롬과 Windows에 이미 있는 기능만 쓴다.

## 원리

Windows에는 "항상 위" 기능이 기본 UI로 없다. 대신 창마다 `HWND_TOPMOST` 속성이 있고,
`user32.dll` 의 `SetWindowPos` 로 그 속성을 켤 수 있다. `pin-widget.ps1` 이 하는 일이 그것이다.

1. 크롬을 `--app=` 모드로 띄운다 → 주소창·탭 없는 창
2. 그 창을 찾아 topmost 로 만들고 위치와 크기를 지정한다

## 설치

PowerShell에 붙여넣는다.

```powershell
$dir = Join-Path $env:LOCALAPPDATA 'PLNA'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ps1 = Join-Path $dir 'pin-widget.ps1'
Invoke-WebRequest -UseBasicParsing 'https://plna.vercel.app/pin-widget.ps1' -OutFile $ps1
Unblock-File -LiteralPath $ps1
powershell -ExecutionPolicy Bypass -File $ps1
```

`Unblock-File` 이 필요한 이유: 인터넷에서 받은 `.ps1` 은 차단 표시가 붙어 기본 실행 정책에서 막힌다.

## 로그인할 때마다 자동으로

시작프로그램 폴더에 바로가기를 만든다.

```powershell
$ps1 = Join-Path $env:LOCALAPPDATA 'PLNA\pin-widget.ps1'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'PLNA 위젯.lnk'
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sc.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$sc.Arguments  = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$sc.Save()
Write-Host "등록됨: $lnk"
```

해제하려면 그 `.lnk` 파일을 지우면 된다 (`shell:startup` 을 실행창에 입력하면 폴더가 열린다).

## 위치와 크기 바꾸기

```powershell
powershell -ExecutionPolicy Bypass -File $ps1 -X 1400 -Y 60 -Width 380 -Height 700
```

| 옵션 | 기본값 | 뜻 |
|------|--------|-----|
| `-X` / `-Y` | `40` / `40` | 화면 왼쪽·위쪽에서의 위치(px) |
| `-Width` / `-Height` | `420` / `620` | 창 크기(px) |
| `-Url` | `https://plna.vercel.app/widget` | 띄울 주소 |

시작프로그램에 등록한 뒤 값을 바꾸려면 위 등록 명령의 `$sc.Arguments` 끝에 같은 옵션을 붙인다.

## 알아둘 것

- **창을 닫으면 고정도 사라진다.** 다시 실행하면 된다.
- 이미 위젯 창이 떠 있으면 새로 띄우지 않고 그 창을 고정한다.
- 전체화면 게임이나 영상 위에는 뜨지 않을 수 있다. Windows가 그런 창을 별도로 다룬다.
- 이 스크립트는 Linux 개발 환경에서 작성해 **Windows 실제 실행 검증은 하지 않았다.**
  문법·괄호 균형·인코딩(UTF-8 BOM)은 확인했다.

## 더 간단한 대안

Microsoft PowerToys 를 설치하면 아무 창에서나 `Win + Ctrl + T` 로 항상 위를 켤 수 있다.
스크립트가 번거로우면 이쪽이 쉽다.

```
winget install Microsoft.PowerToys
```

다만 창을 띄우고 위치를 잡는 일은 직접 해야 하고, 로그인 시 자동 실행도 따로 설정해야 한다.
