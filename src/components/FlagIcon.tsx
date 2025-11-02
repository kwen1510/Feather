import React from 'react';

interface FlagIconProps {
  active?: boolean;
  size?: number;
}

const FlagIcon: React.FC<FlagIconProps> = ({ active = false, size = 20 }) => {
  const stroke = active ? '#ff4d4f' : '#b8c1cc';
  const fill = active ? '#ff4d4f' : 'transparent';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 2.5V17.5"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5 3h10l-2 3 2 3H5V3Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default FlagIcon;

