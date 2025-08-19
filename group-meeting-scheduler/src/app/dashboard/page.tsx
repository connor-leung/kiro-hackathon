import { getRequiredServerSession } from "@/lib/session";
import SignOutButton from "@/components/auth/sign-out-button";

export default async function Dashboard() {
  const session = await getRequiredServerSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Welcome to Group Meeting Scheduler
              </h1>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
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
                      Authentication Successful
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        You are successfully signed in with{" "}
                        {session.user?.email}
                      </p>
                      {session.provider && (
                        <p className="mt-1">Provider: {session.provider}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h2 className="text-lg font-medium text-gray-900 mb-2">
                    User Information
                  </h2>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Name
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.user?.name || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Email
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.user?.email || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Provider
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.provider || "Unknown"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h2 className="text-lg font-medium text-gray-900 mb-2">
                    Session Status
                  </h2>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Access Token
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.accessToken ? "Available" : "Not available"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Session Error
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {session.error || "None"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <SignOutButton />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
