// Compile this file with tsconfig.react-native.json to prove DOM-free use.
import { themes, type OptionColor, type SemanticToken, type ThemeName } from './src/index';

export function nativePalette(theme: ThemeName, option: OptionColor): {
  backgroundColor: string;
  color: string;
} {
  return {
    backgroundColor: themes[theme].options[option].background,
    color: themes[theme].options[option].text,
  };
}

export function nativeText(theme: ThemeName, token: SemanticToken): string {
  return themes[theme].semantic[token];
}
