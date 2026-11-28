import { useMobileWallet } from '@wallet-ui/react-native-kit'

export function useSprintWallet() {
  const wallet = useMobileWallet()
  return {
    available: true,
    address: wallet.account ? String(wallet.account.address) : undefined,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
    signMessages: wallet.signMessages,
  }
}
