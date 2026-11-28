export function useSprintWallet() {
  return {
    available: false,
    address: undefined as string | undefined,
    connect: async () => {
      throw new Error('Mobile Wallet Adapter runs in the Android build, including on a Seeker.')
    },
    disconnect: async () => {},
    signMessages: async (_message: Uint8Array): Promise<Uint8Array> => {
      throw new Error('Mobile Wallet Adapter runs in the Android build, including on a Seeker.')
    },
  }
}
