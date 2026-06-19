import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  size?: PageSize;
  fluid?: boolean;
}

const sizeClasses: Record<PageSize, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
  full: 'w-full',
};

const PageContainer = ({ children, className, size = '2xl', fluid }: PageContainerProps) => {
  const resolvedSize = fluid ? 'full' : size;
  return (
    <div
      className={cn(
        sizeClasses[resolvedSize],
        'w-full mx-auto px-4 md:px-6 py-4 md:py-8',
        className
      )}
    >
      {children}
    </div>
  );
};

export default PageContainer;
