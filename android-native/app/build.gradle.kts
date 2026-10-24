plugins { id("com.android.application") }
android {
    namespace = "com.goreecloud.workspaceai.nativeapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.goreecloud.workspaceai.nativeapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-native-preview1"
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
