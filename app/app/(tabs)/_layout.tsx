import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { ArrivalLayer } from '@/components/arrival-layer'
import { TabBar } from '@/components/tab-bar'
import { color } from '@/constants/theme'

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: color.night }}>
      <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.night } }}>
        <Tabs.Screen name="index" options={{ title: 'Radar' }} />
        <Tabs.Screen name="encounters" options={{ title: 'Encounters' }} />
        <Tabs.Screen name="passport" options={{ title: 'Passport' }} />
      </Tabs>
      <ArrivalLayer />
    </View>
  )
}
