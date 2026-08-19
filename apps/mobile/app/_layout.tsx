import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { MobileAppearanceProvider } from '@/application/mobile-appearance'
import { MobileLanguageProvider } from '@/application/mobile-language'
import { MobileRuntimeProvider } from '@/application/mobile-runtime-context'
import { colors } from '@/ui/theme'
import '@/platform/runtime-polyfills'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAppearanceProvider>
        <MobileLanguageProvider>
          <MobileRuntimeProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerShown: false }} />
          </MobileRuntimeProvider>
        </MobileLanguageProvider>
      </MobileAppearanceProvider>
    </SafeAreaProvider>
  )
}
