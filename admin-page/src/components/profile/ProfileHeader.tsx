import { User } from "@/types/user";
import { StudentProfileStats } from "@/services/studentServices";
import { parsePaymentDate } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MapPin,
  School,
  Phone,
  Send,
  Trophy,
  User as UserIcon,
  Calendar,
  Globe,
} from "lucide-react";

interface ProfileHeaderProps {
  user: User;
  /** Aggregated quickstat numbers; null while unavailable. */
  stats: StudentProfileStats | null;
}

function formatPaymentDate(value: string | Date | null | undefined) {
  const date = parsePaymentDate(value);
  return date ? date.toLocaleDateString() : "no payment";
}

export function ProfileHeader({ user, stats }: ProfileHeaderProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className="mb-8">
      {/* Header */}
      <div className=" border-b border-gray-200 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
              <div className="flex items-center text-sm text-gray-600 mt-1">
                <span>Users</span>
                <span className="mx-2">•</span>
                <span className="text-gray-400">{user.name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
        {/* Profile Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 sm:px-8 py-6 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-0 sm:space-x-6">
            <Avatar className="w-16 h-16 sm:w-24 sm:h-24 border-4 border-white shadow-lg shrink-0">
              <AvatarImage
                src={user.imgurl}
                alt={user.name}
                className="object-cover"
              />
              <AvatarFallback className="text-xl sm:text-2xl font-bold bg-white text-emerald-600">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 break-words">
                {user.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-emerald-100">
                <div className="flex items-center space-x-2">
                  <UserIcon className="w-4 h-4" />
                  <span>Student</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-green-300">online</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Trophy className="w-4 h-4 text-amber-300" />
                  <span className="text-white font-semibold">
                    {stats ? `${stats.totalPoints} Points` : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Details - Adjusted spacing and layout */}
        <div className="bg-gray-50 px-4 sm:px-8 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Personal Information */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Personal Information
              </h3>
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-600">Age: </span>
                  <span className="text-sm font-medium text-gray-900">
                    {user.age} years
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-600">Grade: </span>
                  <span className="text-sm font-medium text-gray-900">
                    Grade {user.grade}
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-600">Gender: </span>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {user.gender}
                  </span>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Location
              </h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900">{user.city}</span>
                </div>
                <div className="flex space-x-2 items-center">
                  <Globe className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">
                    {user.region}
                  </span>
                </div>
                <div className="flex items-center space-x-2 min-w-0">
                  <School className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 truncate">
                    {user.school}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Contact
              </h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900">
                    {user.phoneNumber}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <Send className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900">
                    {user.telegram_id}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Information */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                Payment Status
              </h3>
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600">Last Payment</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatPaymentDate(user.payment.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600">Next Payment</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatPaymentDate(user.payment.expirationDate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
