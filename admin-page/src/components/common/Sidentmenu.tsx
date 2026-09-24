// src/components/layout/MenuList.ts
import {
  LayoutDashboard,
  Users,
  MessageSquareWarning,
  BarChart2,
  PlusSquare,
  FilePlus,
  BookOpen,
} from "lucide-react";
import React from "react";
export interface NavItem {
  id: number;
  title: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}
export function PaymentHistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      className={className}
    >
      <defs />
      <path
        fill="currentColor"
        d="M11.24,7.019 C11.24,3.848 13.822,1.269 16.995,1.269 C20.168,1.269 22.75,3.848 22.75,7.019 C22.75,10.19 20.168,12.769 16.995,12.769 C13.822,12.769 11.24,10.19 11.24,7.019 Z M11.408,22.754 C9.198,22.754 6.88,22.698 5.25,22.603 C3.888,22.523 2.781,21.82 2.05,20.568 C1.469,19.572 1.261,18.458 1.261,17.746 C1.245,16.494 1.25,13.999 1.255,11.341 L1.255,11.337 L1.255,11.221 C1.258,9.799 1.261,8.328 1.261,6.967 C1.261,2.305 4.191,1.56 5.484,1.459 C5.745,1.422 7.62,1.173 10.026,1.274 C10.44,1.291 10.761,1.641 10.744,2.055 C10.727,2.469 10.378,2.79 9.963,2.773 C7.572,2.673 5.694,2.945 5.675,2.948 C5.657,2.951 5.638,2.953 5.619,2.954 C4.315,3.048 2.76,3.821 2.76,6.968 C2.76,8.33 2.757,9.802 2.754,11.225 L2.753,11.695 C2.748,14.214 2.744,16.541 2.76,17.737 C2.76,18.424 3.197,20.981 5.336,21.106 C8.403,21.284 13.928,21.324 16.455,21.107 C16.458,21.107 16.462,21.107 16.465,21.106 L16.476,21.105 C16.499,21.104 18.767,20.949 19.027,18.711 C19.288,16.466 19.27,14.828 19.263,14.211 C19.263,14.165 19.262,14.125 19.262,14.09 C19.261,14.063 19.261,14.039 19.261,14.018 C19.261,13.604 19.597,13.268 20.011,13.268 C20.425,13.268 20.761,13.604 20.761,14.018 C20.761,14.062 20.761,14.121 20.763,14.194 L20.763,14.203 C20.77,14.853 20.789,16.556 20.517,18.884 C20.195,21.657 17.803,22.527 16.573,22.601 C15.339,22.706 13.417,22.752 11.407,22.752 Z M12.74,7.019 C12.74,9.362 14.649,11.269 16.995,11.269 C19.341,11.269 21.25,9.362 21.25,7.019 C21.25,4.676 19.341,2.769 16.995,2.769 C14.649,2.769 12.74,4.676 12.74,7.019 Z M6.98,17.769 C6.566,17.769 6.23,17.433 6.23,17.019 C6.23,16.605 6.566,16.269 6.98,16.269 L14.98,16.269 C15.394,16.269 15.73,16.605 15.73,17.019 C15.73,17.433 15.394,17.769 14.98,17.769 Z M15.98,9.269 L15.941,9.269 C15.671,9.255 15.429,9.097 15.309,8.855 C14.876,7.988 14.454,7.554 14.449,7.55 C14.156,7.257 14.156,6.782 14.449,6.489 C14.742,6.196 15.217,6.196 15.51,6.489 C15.546,6.525 15.757,6.742 16.037,7.143 C16.688,6.3 17.707,5.175 18.73,4.812 C19.12,4.674 19.549,4.878 19.687,5.268 C19.825,5.658 19.621,6.087 19.231,6.225 C18.381,6.526 17.174,8.038 16.613,8.92 C16.475,9.137 16.236,9.268 15.98,9.268 Z M10.98,13.769 L6.98,13.769 C6.566,13.769 6.23,13.433 6.23,13.019 C6.23,12.605 6.566,12.269 6.98,12.269 L10.98,12.269 C11.394,12.269 11.73,12.605 11.73,13.019 C11.73,13.433 11.394,13.769 10.98,13.769 Z"
      />
    </svg>
  );
}
export function QuestionIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      width="1em"
      height="1em"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 256 256"
      className={className}
    >
      <g fill="currentColor">
        <path
          d="M152 128a24 24 0 1 1-24-24a24 24 0 0 1 24 24"
          opacity=".2"
        ></path>
        <path d="M200 152a31.84 31.84 0 0 0-19.53 6.68l-23.11-18A31.65 31.65 0 0 0 160 128c0-.74 0-1.48-.08-2.21l13.23-4.41A32 32 0 1 0 168 104c0 .74 0 1.48.08 2.21l-13.23 4.41A32 32 0 0 0 128 96a32.6 32.6 0 0 0-5.27.44L115.89 81A32 32 0 1 0 96 88a32.6 32.6 0 0 0 5.27-.44l6.84 15.4a31.92 31.92 0 0 0-8.57 39.64l-25.71 22.84a32.06 32.06 0 1 0 10.63 12l25.71-22.84a31.91 31.91 0 0 0 37.36-1.24l23.11 18A31.65 31.65 0 0 0 168 184a32 32 0 1 0 32-32m0-64a16 16 0 1 1-16 16a16 16 0 0 1 16-16M80 56a16 16 0 1 1 16 16a16 16 0 0 1-16-16M56 208a16 16 0 1 1 16-16a16 16 0 0 1-16 16m56-80a16 16 0 1 1 16 16a16 16 0 0 1-16-16m88 72a16 16 0 1 1 16-16a16 16 0 0 1-16 16"></path>
      </g>
    </svg>
  );
}

export function ContestIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      width="1em"
      height="1em"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 256 256"
      className={className}
    >
      <g fill="currentColor">
        <path
          d="M176 56a24 24 0 1 1-24-24a24 24 0 0 1 24 24"
          opacity=".2"
        ></path>
        <path d="M152 88a32 32 0 1 0-32-32a32 32 0 0 0 32 32m0-48a16 16 0 1 1-16 16a16 16 0 0 1 16-16m67.31 100.68c-.61.28-7.49 3.28-19.67 3.28c-13.85 0-34.55-3.88-60.69-20a169.3 169.3 0 0 1-15.41 32.34a104.3 104.3 0 0 1 31.31 15.81C173.92 186.65 184 207.35 184 232a8 8 0 0 1-16 0c0-41.7-34.69-56.71-54.14-61.85c-.55.7-1.12 1.41-1.69 2.1c-19.64 23.8-44.25 36.18-71.63 36.18a92 92 0 0 1-9.34-.43a8 8 0 0 1 1.6-16c25.92 2.59 48.47-7.49 67-30c12.49-15.14 21-33.61 25.25-47c-38.92-22.66-63.78-3.37-64.05-3.16a8 8 0 1 1-10-12.48c1.5-1.2 37.22-29 89.51 6.57c45.47 30.91 71.93 20.31 72.18 20.19a8 8 0 1 1 6.63 14.56Z"></path>
      </g>
    </svg>
  );
}

export const menuList: NavGroup[] = [
  {
    title: "Manage",
    items: [
      {
        id: 1,
        title: "Dashboard",
        path: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        id: 2,
        title: "Questions",
        path: "/dashboard/questions",
        icon: QuestionIcon, // Use custom icon
      },
      {
        id: 3,
        title: "Articles",
        path: "/dashboard/articles",
        icon: BookOpen,
      },
      {
        id: 4,
        title: "Contests",
        path: "/dashboard/contest",
        icon: ContestIcon, // Use custom icon
      },
      {
        id: 5,
        title: "Payments",
        path: "/dashboard/payment",
        icon: PaymentHistoryIcon,
      },
      {
        id: 6,
        title: "Users",
        path: "/dashboard/users",
        icon: Users,
      },
    ],
  },
  {
    title: "Create",
    items: [
      {
        id: 8,
        title: "Add Contest",
        path: "/dashboard/addcontest",
        icon: PlusSquare,
      },
      {
        id: 9,
        title: "Add Question",
        path: "/dashboard/addquestion",
        icon: FilePlus,
      },
    ],
  },
  {
    title: "Insight",
    items: [
      {
        id: 7,
        title: "Feedback",
        path: "/dashboard/feedback",
        icon: MessageSquareWarning,
      },
      {
        id: 8,
        title: "High Scorers",
        path: "/dashboard/high-scorers",
        icon: BarChart2,
      },
    ],
  },
];

// Remove the Actions section that was referencing undefined navigationItems
// For backward compatibility, create a flat list from the menuList
export const flatMenuList: NavItem[] = menuList.flatMap((group) => group.items);
