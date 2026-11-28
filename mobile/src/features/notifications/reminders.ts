import * as Notifications from 'expo-notifications'
import { AndroidImportance } from 'expo-notifications'
import { Platform } from 'react-native'

import { planReminders, type ReminderPlan } from '@/lib/policies'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

const SCOPE = 'examsprep-local'
const CHANNEL = 'study'

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  const next = await Notifications.requestPermissionsAsync()
  return next.granted
}

export async function applyLocalReminders(input: {
  dailyStudy: boolean
  streakWarning: boolean
  examReminder: boolean
  dailyHour: number
  dailyMinute: number
  examDates: string[]
}): Promise<{ scheduled: number; permission: boolean }> {
  const permission = await ensureNotificationPermission()
  if (!permission) return { scheduled: 0, permission: false }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Study reminders',
      importance: AndroidImportance.DEFAULT,
    })
  }
  const existing = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    existing
      .filter((item) => item.content.data?.scope === SCOPE)
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  )
  const plans = planReminders({ ...input, now: new Date() })
  for (const plan of plans) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: plan.title,
        body: plan.body,
        data: { scope: SCOPE, channel: plan.channel },
      },
      trigger: triggerFor(plan),
    })
  }
  return { scheduled: plans.length, permission: true }
}

function triggerFor(plan: ReminderPlan): Notifications.NotificationTriggerInput {
  if (plan.when.kind === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: CHANNEL,
      hour: plan.when.hour,
      minute: plan.when.minute,
    }
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    channelId: CHANNEL,
    date: new Date(plan.when.iso),
  }
}
