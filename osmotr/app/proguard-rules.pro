# CameraX и Coil поставляют свои правила; своих классов через отражение нет.

# Сканер документов Google (ML Kit): компоненты находятся по записям в манифесте и по отражению —
# без этого R8 переименовывает их, и сканер падает NullPointerException при создании (20.10.2026).
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }
-keep class * implements com.google.firebase.components.ComponentRegistrar { *; }
-keep class * implements com.google.mlkit.common.sdkinternal.** { *; }
-keepclassmembers class * { @com.google.android.gms.common.annotation.KeepName *; }
-keep @com.google.android.gms.common.annotation.KeepName class *
