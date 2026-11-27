import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router/js-tabs'

export default function MainTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0E6B62',
        tabBarInactiveTintColor: '#5C6B73',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E2E8E4' },
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
        name="quizzes"
        options={{
          title: 'Quizzes',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="checkbox-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Board',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="trophy-outline" size={size} />,
        }}
      />
      <Tabs.Screen
        name="badges"
        options={{
          title: 'Badges',
          tabBarIcon: ({ color, size }) => <Ionicons color={color as string} name="ribbon-outline" size={size} />,
        }}
      />
    </Tabs>
  )
}
