export const projectConfig = {
  id: 'genesis-sync',
  label: 'genesis-sync',
  brandAccent: {
    hex: '#14b8a6',
  },
} as const

export const projectBanner = {
  segments: [
    { text: 'genesis' },
    { text: 'sync', colorHex: projectConfig.brandAccent.hex },
  ],
}
