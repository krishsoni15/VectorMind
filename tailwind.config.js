const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'vm-bg': '#0D0D0F',
        'vm-card': '#1A1A1F',
        'vm-card-hover': '#222228',
        'vm-accent': '#1D9E75',
        'vm-accent-light': '#2BC48E',
        zinc: {
          ...colors.zinc,
          150: '#eeeff2',
          250: '#d8d8de',
          255: '#f0f0f3',
          350: '#b8b8c0',
          405: '#a0a0ac',
          450: '#9898a4',
          455: '#90909c',
          550: '#787884',
          650: '#585864',
          750: '#3a3a44',
          850: '#2a2a30',
          855: '#26262c',
          955: '#111114',
        },
        emerald: {
          ...colors.emerald,
          450: '#34d399',
          555: '#10b981',
        },
        red: {
          ...colors.red,
          405: '#f87171',
          650: '#dc2626',
          955: '#1c0a0a',
        },
        blue: {
          ...colors.blue,
          450: '#60a5fa',
        },
        orange: {
          ...colors.orange,
          450: '#fb923c',
        },
        green: {
          ...colors.green,
          450: '#4ade80',
        },
      },
      spacing: {
        42: '10.5rem',
      },
      transitionTimingFunction: {
        'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
