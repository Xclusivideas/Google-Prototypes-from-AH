
import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  timeLeft: number;
  totalTime: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total, timeLeft, totalTime }) => {
  const progressPercent = Math.min(100, (current / total) * 100);
  const timePercent = Math.min(100, (timeLeft / totalTime) * 100);
  
  // Color transition for timer
  let timerColor = 'bg-primary-500';
  // With 5 seconds total: 
  // < 30% is 1.5s (Red)
  // < 60% is 3s (Yellow)
  if (timePercent < 35) timerColor = 'bg-red-500';
  else if (timePercent < 65) timerColor = 'bg-yellow-500';

  return (
    <div className="w-full space-y-3 mb-2">
      {/* Progress Line */}
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
         <div 
           className="h-full bg-slate-800 transition-all duration-500 ease-out rounded-full"
           style={{ width: `${progressPercent}%` }}
         />
      </div>

      {/* Timer Line (thinner) */}
      <div className="flex items-center gap-3">
        <div className="h-1 flex-grow bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${timerColor} transition-all duration-1000 linear`}
            style={{ width: `${timePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
