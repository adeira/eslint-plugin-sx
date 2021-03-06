// @flow

import type { Node } from 'react';
import sx from '@adeira/sx';

export default function MyCustomComponent(): Node {
  // eslint-disable-next-line dot-notation
  return <div xstyle={styles['spacing']} />;
}

const styles = sx.create({
  spacing: {
    marginBlockStart: 4,
  },
});
