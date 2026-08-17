import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { LiquidGlass } from '@/ui/liquid-glass'
import { colors } from '@/ui/theme'

const tabIcons = {
  journal: 'calendar-outline',
  learning: 'sparkles-outline',
  notes: 'document-text-outline',
  shelf: 'library-outline',
} as const

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    bottom: 10,
    elevation: 0,
    height: 72,
    left: 14,
    paddingBottom: 7,
    paddingTop: 7,
    position: 'absolute',
    right: 14,
    shadowColor: '#24231F',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.11,
    shadowRadius: 24,
  },
  tabBarBackground: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    borderRadius: 25,
  },
})

function GlassTabBarBackground() {
  return <LiquidGlass pointerEvents="none" style={styles.tabBarBackground} variant="surface" />
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarBackground: GlassTabBarBackground,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size }) => (
          <Ionicons color={color} name={tabIcons[route.name as keyof typeof tabIcons]} size={size} />
        ),
        tabBarItemStyle: { borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: styles.tabBar,
      })}
    >
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="learning" options={{ title: 'Learning' }} />
      <Tabs.Screen name="shelf" options={{ title: 'Shelf' }} />
    </Tabs>
  )
}
