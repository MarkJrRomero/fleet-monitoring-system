/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'on-primary-fixed': '#003798',
        'on-surface': '#00345e',
        'surface-container-highest': '#d2e4ff',
        'tertiary-fixed-dim': '#e3e5e7',
        'tertiary-fixed': '#f2f4f6',
        'surface-bright': '#f8f9ff',
        'on-error-container': '#752121',
        'primary-container': '#dbe1ff',
        'primary-fixed': '#dbe1ff',
        secondary: '#006b62',
        'on-primary-fixed-variant': '#0050d4',
        'on-secondary-fixed-variant': '#00675e',
        'surface-container-lowest': '#ffffff',
        tertiary: '#5c5f61',
        'surface-variant': '#d2e4ff',
        primary: '#00F1C6',
        'on-tertiary-fixed-variant': '#636768',
        'tertiary-container': '#f2f4f6',
        'on-secondary-fixed': '#004841',
        'on-secondary-container': '#005c54',
        'error-container': '#fe8983',
        'on-primary': '#003a31',
        'inverse-surface': '#000f21',
        'outline-variant': '#81b5f6',
        'on-tertiary': '#f7f9fb',
        'secondary-fixed-dim': '#7ae7d8',
        'secondary-dim': '#005e56',
        background: '#f8f9ff',
        'surface-container': '#e5eeff',
        surface: '#f8f9ff',
        'inverse-on-surface': '#8e9eb7',
        'on-tertiary-container': '#595c5e',
        'on-primary-container': '#0048bf',
        'surface-dim': '#c4dcff',
        'surface-tint': '#00F1C6',
        'inverse-primary': '#618bff',
        error: '#9f403d',
        'secondary-container': '#89f5e7',
        'on-surface-variant': '#26619d',
        outline: '#477dbb',
        'on-error': '#fff7f6',
        'primary-fixed-dim': '#c7d3ff',
        'on-secondary': '#e2fff9',
        'primary-dim': '#0048c1',
        'surface-container-high': '#dce9ff',
        'on-tertiary-fixed': '#474a4c',
        'secondary-fixed': '#89f5e7',
        'tertiary-dim': '#505455',
        'on-background': '#00345e',
        'error-dim': '#4e0309',
        'surface-container-low': '#eff4ff'
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      },
      fontFamily: {
        headline: ['Plus Jakarta Sans', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
};