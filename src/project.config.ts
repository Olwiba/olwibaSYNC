export const projectConfig = {
  id: 'genesis-sync',
  label: 'genesis-sync',
  brandAccent: {
    hex: '#10b981',
  },
} as const

export const projectBanner = {
  segments: [
    { text: 'genesis', colorHex: projectConfig.brandAccent.hex },
    { text: 'sync' },
  ],
}
