import './spinner.scss';

interface SpinnerProps {
  /** If true, centers the spinner in the viewport for large page containers */
  fullPage?: boolean;
  /** Additional CSS class name */
  className?: string;
}

const Spinner = ({ fullPage = false, className = '' }: SpinnerProps) => {
  const containerClass = fullPage
    ? `spinner-container spinner-container--full-page ${className}`.trim()
    : `spinner-container ${className}`.trim();

  return (
    <div className={containerClass}>
      <div className="spinner" />
    </div>
  );
};

export default Spinner;
