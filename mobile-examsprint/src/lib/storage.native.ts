import * as SecureStore from 'expo-secure-store'

const KEY = 'examsprint.session'

export async function readSession(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY)
}

export async function writeSession(value: string | null): Promise<void> {
  if (value == null) await SecureStore.deleteItemAsync(KEY)
  else await SecureStore.setItemAsync(KEY, value)
}
