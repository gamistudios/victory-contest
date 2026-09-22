interface NewBadgeProps {
  text?: string;
  className?: string;
}

/**
 * A professional "New" badge component styled with Tailwind CSS.
 * @param {string} [text='NEW'] - The text to display inside the badge.
 * @param {string} [className] - Additional Tailwind CSS classes for customization.
 */
const NewBadge: React.FC<NewBadgeProps> = ({
  text = "NEW",
  className = "",
}) => {
  return (
    <span
      className={`
        inline-flex items-center justify-center 
        px-2 py-1 
        text-xs font-bold leading-none 
        text-white bg-blue-600 
        rounded-full
        ${className}
      `}
    >
      {text}
    </span>
  );
};

export default NewBadge;
