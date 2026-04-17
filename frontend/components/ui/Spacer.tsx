import React from 'react';
import { View } from 'react-native';

type Props = { size?: number, horizontal?: boolean };

export const Spacer: React.FC<Props> = ({ size = 16, horizontal = false }) => (
  <View style={horizontal ? { width: size } : { height: size }} />
);

export default Spacer;
