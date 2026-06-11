export const projectConfig = {
  id: 'olwibaSYNC',
  label: 'olwibaSYNC',
  brandAccent: {
    hex: '#14b8a6',
  },
} as const

export const projectBanner = {
  segments: [
    { text: 'olwiba', colorHex: projectConfig.brandAccent.hex },
    { text: 'sync' },
  ],
}
