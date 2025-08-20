import { getRequiredServerSession } from "@/lib/session";
import SignOutButton from "@/components/auth/sign-out-button";
import CalendarUpload from "@/components/calendar/calendar-upload";
import CalendarProviders from "@/components/calendar/calendar-providers";
import MeetingPreferences from "@/components/meeting/meeting-preferences";

export default async function Dashboard() {
  const session = await getRequiredServerSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Schedule Your Meeting
              </h1>
              <p className="mt-2 text-gray-600">
                Connect calendars and find the perfect time for everyone
              </p>
            </div>
            <SignOutButton />
          </div>

          {/* User Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-blue-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Signed in as {session.user?.name || session.user?.email}
                </h3>
                <p className="mt-1 text-sm text-blue-700">
                  Connected via {session.provider || "Unknown provider"}
                </p>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Calendar Sources */}
            <div className="lg:col-span-2 space-y-8">
              {/* Calendar Providers */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    Connect Calendar Providers
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Connect your Google or Microsoft calendars for automatic
                    scheduling
                  </p>
                </div>
                <div className="p-6">
                  <CalendarProviders />
                </div>
              </div>

              {/* File Upload */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    Upload Calendar Files
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Upload iCal (.ics) files from participants who can&apos;t
                    connect directly
                  </p>
                </div>
                <div className="p-6">
                  <CalendarUpload />
                </div>
              </div>
            </div>

            {/* Meeting Preferences */}
            <div className="lg:col-span-1">
              <div className="bg-white shadow rounded-lg sticky top-6">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    Meeting Preferences
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Set your meeting requirements and constraints
                  </p>
                </div>
                <div className="p-6">
                  <MeetingPreferences />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
