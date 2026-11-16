$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$NativeDir = Join-Path $RepoRoot "android-native"
if (-not (Test-Path (Join-Path $NativeDir "app\build.gradle.kts"))) {
  throw "Direktori android-native tidak ditemukan di: $NativeDir"
}

# 1. Pastikan Android SDK terdeteksi & tulis android-native\local.properties
$SdkDir = if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
  $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
  $env:ANDROID_SDK_ROOT
} else {
  Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path $SdkDir)) {
  throw "Android SDK tidak ditemukan di '$SdkDir'. Buka Android Studio -> SDK Manager atau set `$env:ANDROID_HOME."
}
$SdkEscaped = $SdkDir -replace '\\', '/'
"sdk.dir=$SdkEscaped" | Set-Content (Join-Path $NativeDir "local.properties") -Encoding ascii

# 2. Pastikan JDK 21 tersedia (dibutuhkan oleh android-native / AGP 8.7.3)
function Test-Jdk21([string]$JavaExe) {
  if (-not (Test-Path $JavaExe)) { return $false }
  $ver = (& $JavaExe -version 2>&1 | Out-String)
  return ($ver -match 'version "21\.')
}

$CurrentJavaCmd = Get-Command java -ErrorAction SilentlyContinue
$CurrentJava = if ($CurrentJavaCmd) { $CurrentJavaCmd.Source } else { $null }
if (-not ($CurrentJava -and (Test-Jdk21 $CurrentJava))) {
  $JdkCandidates = @(
    $env:JAVA_HOME,
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Android\Android Studio Preview\jbr",
    (Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr")
  )
  $JdkCandidates += (Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $JdkCandidates += (Get-ChildItem "C:\Program Files\Java\jdk-21*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  $JdkCandidates += (Get-ChildItem "C:\Program Files\Microsoft\jdk-21*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })

  $MatchedHome = $JdkCandidates | Where-Object { $_ -and (Test-Jdk21 (Join-Path $_ "bin\java.exe")) } | Select-Object -First 1
  if (-not $MatchedHome) {
    throw "JDK 21 tidak ditemukan. Pasang JDK 21 atau Android Studio (JBR 21), lalu set `$env:JAVA_HOME."
  }
  $env:JAVA_HOME = $MatchedHome
  $env:PATH = "$(Join-Path $MatchedHome 'bin');$env:PATH"
  Write-Host "[soundclear] Menggunakan JDK 21: $MatchedHome"
}

# 3. Set URL backend (opsional, default https://soundclear-lyart.vercel.app/)
if (-not $env:SOUNDCLEAR_API_BASE_URL -and -not $env:VITE_API_BASE_URL) {
  $env:SOUNDCLEAR_API_BASE_URL = "https://soundclear-lyart.vercel.app"
}

# 4. Pastikan Gradle Wrapper (gradlew.bat) tersedia; jika belum, siapkan Gradle 8.11.1
Push-Location $NativeDir
try {
  $GradlewBat = Join-Path $NativeDir "gradlew.bat"
  $WrapperJar = Join-Path $NativeDir "gradle\wrapper\gradle-wrapper.jar"

  if (-not ((Test-Path $GradlewBat) -and (Test-Path $WrapperJar))) {
    $GradleCmdInfo = Get-Command gradle -ErrorAction SilentlyContinue
    $GradleCmd = if ($GradleCmdInfo) { $GradleCmdInfo.Source } else { $null }
    if (-not $GradleCmd) {
      $CacheRoot = Join-Path $env:LOCALAPPDATA "SoundClear\gradle"
      $GradleHome = Join-Path $CacheRoot "gradle-8.11.1"
      $GradleBin = Join-Path $GradleHome "bin\gradle.bat"
      if (-not (Test-Path $GradleBin)) {
        New-Item -ItemType Directory -Force $CacheRoot | Out-Null
        $ZipPath = Join-Path $CacheRoot "gradle-8.11.1-bin.zip"
        Write-Host "[soundclear] Mengunduh Gradle 8.11.1..."
        Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" -OutFile $ZipPath
        Expand-Archive -Path $ZipPath -DestinationPath $CacheRoot -Force
        Remove-Item -Force $ZipPath
      }
      $GradleCmd = $GradleBin
    }

    Write-Host "[soundclear] Membuat Gradle Wrapper di android-native..."
    & $GradleCmd wrapper --gradle-version 8.11.1 --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gagal membuat Gradle Wrapper!" }
  }

  # 5. Build Debug APK native
  .\gradlew.bat assembleDebug --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Build APK android-native gagal!" }

  $ApkPath = Join-Path $NativeDir "app\build\outputs\apk\debug\app-debug.apk"
  Write-Host "`nAPK native berhasil dibuat: $ApkPath" -ForegroundColor Green
} finally {
  Pop-Location
}
