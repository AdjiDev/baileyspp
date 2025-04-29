# <div align='center'>Baileys++</div>

<div align="center"><img src="https://wallpapercave.com/wp/wp11696152.jpg"></div>

## Important Note

The original repository was initially removed by its creator and subsequently taken over by [WhiskeySockets](https://github.com/WhiskeySockets). Building upon this foundation, I have implemented several enhancements and introduced new features that were not present in the original repository. These improvements aim to elevate functionality and provide a more robust and versatile experience.

## Install

Install in package.json:
```json
"dependencies": {
    "baileys": "github:adjidev/baileyspp"
}
```
or install in terminal:
```
npm install baileys@github:adjidev/baileyspp
```

Then import the default function in your code:
```ts 
// type esm
import makeWASocket from '@adjidev/baileyspp'
```

```js
// type cjs
const { default: makeWASocket } = require("@adjidev/baileyspp")
```

## New Features and Improvements
Here are some of the features and improvements I have added:

- **SQLite Auth State:** Now supports SQLite for smaller production environments, providing a lightweight solution for authentication state storage.

- **MongoDB Auth State:** Supports MongoDB for larger-scale, high-production environments, ensuring scalability and reliability for authentication storage.

More features and improvements will be added in the future.

### Yoo guys please Check Out [here](https://kusoft.fun/project/baileysPP) to see documentation


## Reporting Issues
If you encounter any issues while using this repository or any part of it, please feel free to open a [new issue](https://github.com/adjidev/baileyspp/issues) here.

## Notes
Everything other than the modifications mentioned above remains the same as the original repository. You can check out the original repository at [WhiskeySockets](https://github.com/WhiskeySockets/Baileys)