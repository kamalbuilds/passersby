import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Radar' }} />
      <Tabs.Screen name="encounters" options={{ title: 'Encounters' }} />
      <Tabs.Screen name="passport" options={{ title: 'Passport' }} />
    </Tabs>
  )
}
