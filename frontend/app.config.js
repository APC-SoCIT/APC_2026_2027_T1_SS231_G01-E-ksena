import 'dotenv/config';

export default {
  expo: {
    name: "E-KSENA",
    slug: "e-ksena-emergency",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "eksena",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "This app needs location access to provide emergency services and show your location on the map.",
        NSCameraUsageDescription: "This app needs camera access to record emergency videos and send reports to dispatchers.",
        NSMicrophoneUsageDescription: "This app needs microphone access to record audio for emergency reports.",
        NSPhotoLibraryUsageDescription: "This app needs photo library access to save emergency videos and photos."
      }
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#dc2626",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyBGmlFmGPmmxmkkU-9NU-h_Tb_QDjg4aMo"
        }
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "RECORD_AUDIO",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "SEND_SMS",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO"
      ],
      package: "com.example.myapp"
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000"
          }
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "This app needs location access to provide emergency services and show your location on the map."
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "This app needs camera access to record emergency videos and send reports to dispatchers.",
          microphonePermission: "This app needs microphone access to record audio for emergency reports."
        }
      ],
      [
        "@config-plugins/react-native-webrtc",
        {
          cameraPermission: "Allow this app to access the camera for live emergency video.",
          microphonePermission: "Allow this app to access the microphone for live emergency audio."
        }
      ],
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsDownloadToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "YOUR_MAPBOX_SECRET_DOWNLOAD_TOKEN"
        }
      ]
    ],
    extra: {
      router: {},
      eas: {
        projectId: "8f174c4d-8cf6-436e-9f75-17b8a2413e6f"
      }
    },
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    }
  }
};
