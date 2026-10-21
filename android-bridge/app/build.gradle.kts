import java.util.Properties
plugins { id("com.android.application") }
val sign = Properties()
val signingProps = file(System.getProperty("user.home") + "/.config/goreecloud/signing/workspace-ai-development.properties")
if (signingProps.isFile) signingProps.inputStream().use { sign.load(it) }
android {
    namespace = "com.goreecloud.workspaceai"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.goreecloud.workspaceai"
        minSdk = 26
        targetSdk = 35
        versionCode = 100001
        versionName = "0.1.0-dev.1"
    }
    signingConfigs {
        if (signingProps.isFile) {
            create("development") {
                storeFile = file(sign.getProperty("storeFile"))
                storePassword = sign.getProperty("storePassword")
                keyAlias = sign.getProperty("keyAlias")
                keyPassword = sign.getProperty("keyPassword")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            if (signingProps.isFile) signingConfig = signingConfigs.getByName("development")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
