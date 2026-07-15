# Design System - Theme Colors

Every application built in this workspace MUST use the following Material Design 3 color tokens. Do not invent or hardcode arbitrary colors — always reference these tokens.

## Color Tokens

### Primary
| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#7C580D` | Main brand color, prominent buttons, active states |
| On Primary | `#FFFFFF` | Text/icons on Primary surfaces |
| Primary Container | `#FFDEAB` | Less prominent fills (cards, chips, FABs) |
| On Primary Container | `#5F4100` | Text/icons on Primary Container surfaces |

### Secondary
| Token | Hex | Usage |
|-------|-----|-------|
| Secondary | `#6D5C3F` | Secondary actions, less prominent components |
| On Secondary | `#FFFFFF` | Text/icons on Secondary surfaces |
| Secondary Container | `#F8DFBB` | Secondary container fills |
| On Secondary Container | `#54442A` | Text/icons on Secondary Container surfaces |

### Tertiary
| Token | Hex | Usage |
|-------|-----|-------|
| Tertiary | `#4E6543` | Accent/complementary color for contrast |
| On Tertiary | `#FFFFFF` | Text/icons on Tertiary surfaces |
| Tertiary Container | `#D0EBC0` | Tertiary container fills |
| On Tertiary Container | `#374D2D` | Text/icons on Tertiary Container surfaces |

### Error
| Token | Hex | Usage |
|-------|-----|-------|
| Error | `#BA1A1A` | Error states, destructive actions |
| On Error | `#FFFFFF` | Text/icons on Error surfaces |
| Error Container | `#FFDAD6` | Error container fills (banners, alerts) |
| On Error Container | `#93000A` | Text/icons on Error Container surfaces |

### Background & Surface
| Token | Hex | Usage |
|-------|-----|-------|
| Background | `#FFF8F3` | App background |
| On Background | `#201B13` | Text/icons on Background |
| Surface | `#FFF8F3` | Surface-level components |
| On Surface | `#201B13` | Text/icons on Surface |
| Surface Variant | `#EEE0CF` | Variant surfaces (cards, dialogs) |
| On Surface Variant | `#4E4539` | Text/icons on Surface Variant |

### Outline
| Token | Hex | Usage |
|-------|-----|-------|
| Outline | `#807667` | Borders, dividers, medium-emphasis outlines |
| Outline Variant | `#D2C5B4` | Low-emphasis outlines, decorative borders |

### Surface Containers
| Token | Hex | Usage |
|-------|-----|-------|
| Surface Container | `#F8ECDF` | Default container elevation |
| Surface Container High | `#F2E6D9` | Higher elevation containers |
| Surface Container Highest | `#ECE1D4` | Highest elevation containers |

## Implementation Rules

1. **Always use semantic token names** (e.g., `--color-primary`, `--color-on-primary`) rather than raw hex values in component code.
2. **Pair "On" colors correctly** — text on a `Primary` background must use `On Primary`, never another arbitrary white.
3. **Error colors are reserved** for error/destructive states only. Do not use them for decorative purposes.
4. **Surface hierarchy**: Use Surface → Surface Container → Surface Container High → Surface Container Highest for increasing visual elevation.
5. **Contrast compliance**: The On/Container pairings are designed for WCAG AA contrast. Do not mix tokens across groups.

## CSS Custom Properties (reference implementation)

```css
:root {
  /* Primary */
  --color-primary: #7C580D;
  --color-on-primary: #FFFFFF;
  --color-primary-container: #FFDEAB;
  --color-on-primary-container: #5F4100;

  /* Secondary */
  --color-secondary: #6D5C3F;
  --color-on-secondary: #FFFFFF;
  --color-secondary-container: #F8DFBB;
  --color-on-secondary-container: #54442A;

  /* Tertiary */
  --color-tertiary: #4E6543;
  --color-on-tertiary: #FFFFFF;
  --color-tertiary-container: #D0EBC0;
  --color-on-tertiary-container: #374D2D;

  /* Error */
  --color-error: #BA1A1A;
  --color-on-error: #FFFFFF;
  --color-error-container: #FFDAD6;
  --color-on-error-container: #93000A;

  /* Background & Surface */
  --color-background: #FFF8F3;
  --color-on-background: #201B13;
  --color-surface: #FFF8F3;
  --color-on-surface: #201B13;
  --color-surface-variant: #EEE0CF;
  --color-on-surface-variant: #4E4539;

  /* Outline */
  --color-outline: #807667;
  --color-outline-variant: #D2C5B4;

  /* Surface Containers */
  --color-surface-container: #F8ECDF;
  --color-surface-container-high: #F2E6D9;
  --color-surface-container-highest: #ECE1D4;
}
```

## Tailwind / Utility Class Config (reference)

When using Tailwind CSS, extend the theme with these tokens:

```js
// tailwind.config.js (partial)
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7C580D', on: '#FFFFFF', container: '#FFDEAB', 'on-container': '#5F4100' },
        secondary: { DEFAULT: '#6D5C3F', on: '#FFFFFF', container: '#F8DFBB', 'on-container': '#54442A' },
        tertiary: { DEFAULT: '#4E6543', on: '#FFFFFF', container: '#D0EBC0', 'on-container': '#374D2D' },
        error: { DEFAULT: '#BA1A1A', on: '#FFFFFF', container: '#FFDAD6', 'on-container': '#93000A' },
        background: { DEFAULT: '#FFF8F3', on: '#201B13' },
        surface: { DEFAULT: '#FFF8F3', on: '#201B13', variant: '#EEE0CF', 'on-variant': '#4E4539' },
        outline: { DEFAULT: '#807667', variant: '#D2C5B4' },
        'surface-container': { DEFAULT: '#F8ECDF', high: '#F2E6D9', highest: '#ECE1D4' },
      },
    },
  },
};
```
