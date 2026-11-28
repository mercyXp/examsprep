import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router/js-tabs'

import { colors } from '@/ui/screen'

export default function MainTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="home-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="book-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: 'Study',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="checkbox-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'AI',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="sparkles-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="person-outline" size={size} />,
        }}
      />
      <Tabs.Screen name="quizzes" options={{ href: null }} />
      <Tabs.Screen name="mocks" options={{ href: null }} />
      <Tabs.Screen name="planner" options={{ href: null }} />
      <Tabs.Screen name="snap" options={{ href: null }} />
      <Tabs.Screen name="tutor" options={{ href: null }} />
      <Tabs.Screen name="audio" options={{ href: null }} />
      <Tabs.Screen name="achievements" options={{ href: null }} />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="badges" options={{ href: null }} />
    </Tabs>
  )
}
