
import React, { useMemo } from 'react';

interface SpatialViewProps {
  pairs: boolean[]; // true = match (same symbol), false = mirror
}

const ASYMMETRIC_LETTERS = ['R', 'F', 'L', 'P', 'J', 'G', 'Q', 'E', 'B'];

export const SpatialView: React.FC<SpatialViewProps> = ({ pairs }) => {
  
  // Select a random letter for this specific question instance.
  // We use useMemo with an empty dependency array so it stays stable 
  // while this specific component instance is mounted.
  const letter = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * ASYMMETRIC_LETTERS.length);
    return ASYMMETRIC_LETTERS[randomIndex];
  }, []);

  // Compute configurations for the pairs to ensure stability across re-renders (timer ticks)
  // and to randomize the "Top" symbol's mirrored state.
  const pairConfigs = useMemo(() => {
    return pairs.map((isMatch, index) => {
      // Randomize if the top symbol is mirrored or not
      const isTopMirrored = Math.random() < 0.5;
      
      // Calculate rotations
      // Base rotation + some random offset to avoid patterns
      const baseRot = (index * 90 + Math.floor(Math.random() * 60)) % 360; 
      
      // Difference in rotation for the bottom one. 
      // Ensure it's not too close to 0 or 360 so it requires mental rotation.
      const diffRot = 90 + Math.floor(Math.random() * 180); 
      const compRot = (baseRot + diffRot) % 360;

      // Logic:
      // If pairs[i] is TRUE (Match): Bottom must be same as Top (just rotated)
      //    -> isBottomMirrored = isTopMirrored
      // If pairs[i] is FALSE (No Match/Mirror): Bottom must be mirror of Top
      //    -> isBottomMirrored = !isTopMirrored
      const isBottomMirrored = isMatch ? isTopMirrored : !isTopMirrored;

      return {
        isTopMirrored,
        isBottomMirrored,
        baseRot,
        compRot
      };
    });
  }, [pairs]);

  const renderSymbol = (isMirror: boolean, rotation: number) => {
    return (
      <svg 
        width="60" 
        height="60" 
        viewBox="0 0 60 60" 
        style={{ 
          transform: `rotate(${rotation}deg) scaleX(${isMirror ? -1 : 1})`,
          transition: 'none',
          overflow: 'visible'
        }}
      >
        <text
          x="30"
          y="32" // Slight offset for visual center
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="48"
          fontWeight="900"
          fill="#0f172a"
          style={{ fontFamily: 'Inter, sans-serif', userSelect: 'none' }}
        >
          {letter}
        </text>
      </svg>
    );
  };

  return (
    <div className="flex flex-wrap justify-center gap-12 py-4">
      {pairConfigs.map((config, index) => {
        return (
          <div key={index} className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
             {/* Top Box */}
             <div className="bg-white w-28 h-28 flex items-center justify-center border-2 border-slate-800 rounded-lg shadow-sm">
               {renderSymbol(config.isTopMirrored, config.baseRot)}
             </div>
             
             {/* Bottom Box */}
             <div className="bg-white w-28 h-28 flex items-center justify-center border-2 border-slate-800 rounded-lg shadow-sm">
               {renderSymbol(config.isBottomMirrored, config.compRot)}
             </div>
          </div>
        );
      })}
    </div>
  );
};
