export const propaiGreen = '#3EE88A';
export const propaiGreenDark = '#2DC96E';
export const propaiGreenMuted = 'rgba(62, 232, 138, 0.25)';
export const propaiGreenDim = 'rgba(62, 232, 138, 0.12)';
export const onPropaiGreen = '#0D1A12';

export const colors = {
  propai: {
    green: '#3EE88A',
    greenDark: '#2DC96E',
    greenMuted: 'rgba(62, 232, 138, 0.25)',
    greenDim: 'rgba(62, 232, 138, 0.12)',
    onGreen: '#0D1A12',
  },
} as const;

export type PropaiColor = keyof typeof colors.propai;

export { Footer } from "./components/Footer";
