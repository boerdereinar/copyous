import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

export const VERSION: number = Number(Config.PACKAGE_VERSION.split('.')[0]);

// St.ButtonMask >= GNOME 51
type StButtonMask = {
	PRIMARY: St.ButtonMask.ONE;
	MIDDLE: St.ButtonMask.TWO;
	SECONDARY: St.ButtonMask.THREE;
};

export const ButtonMask = {
	PRIMARY: 'PRIMARY' in St.ButtonMask ? (St.ButtonMask as unknown as StButtonMask).PRIMARY : St.ButtonMask.ONE,
	MIDDLE: 'MIDDLE' in St.ButtonMask ? (St.ButtonMask as unknown as StButtonMask).MIDDLE : St.ButtonMask.TWO,
	SECONDARY:
		'SECONDARY' in St.ButtonMask ? (St.ButtonMask as unknown as StButtonMask).SECONDARY : St.ButtonMask.THREE,
};
