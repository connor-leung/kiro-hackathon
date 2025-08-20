"use client";

import { useState } from "react";

interface MeetingPreferences {
  duration: number;
  timeRangeStart: string;
  timeRangeEnd: string;
  excludeWeekends: boolean;
  excludedDates: string[];
  bufferTime: number;
  timezone: string;
}

const DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

const BUFFER_TIME_OPTIONS = [
  { value: 0, label: "No buffer" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
];

export default function MeetingPreferences() {
  const [preferences, setPreferences] = useState<MeetingPreferences>({
    duration: 60,
    timeRangeStart: "09:00",
    timeRangeEnd: "17:00",
    excludeWeekends: true,
    excludedDates: [],
    bufferTime: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newExcludedDate, setNewExcludedDate] = useState("");

  const handlePreferenceChange = (
    key: keyof MeetingPreferences,
    value: string | number | boolean | string[]
  ) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const addExcludedDate = () => {
    if (
      newExcludedDate &&
      !preferences.excludedDates.includes(newExcludedDate)
    ) {
      setPreferences((prev) => ({
        ...prev,
        excludedDates: [...prev.excludedDates, newExcludedDate],
      }));
      setNewExcludedDate("");
    }
  };

  const removeExcludedDate = (date: string) => {
    setPreferences((prev) => ({
      ...prev,
      excludedDates: prev.excludedDates.filter((d) => d !== date),
    }));
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/meetings/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preferences,
          // In a real implementation, you'd also send the session ID or calendar data
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Analysis failed");
      }

      const result = await response.json();

      // Handle successful analysis
      console.log("Analysis result:", result);

      // In a real implementation, you'd navigate to results page or update UI
      alert("Analysis complete! Check the console for results.");
    } catch (error) {
      console.error("Analysis error:", error);
      alert(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Meeting Duration
        </label>
        <select
          value={preferences.duration}
          onChange={(e) =>
            handlePreferenceChange("duration", parseInt(e.target.value))
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Time Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Preferred Time Range
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={preferences.timeRangeStart}
              onChange={(e) =>
                handlePreferenceChange("timeRangeStart", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Time</label>
            <input
              type="time"
              value={preferences.timeRangeEnd}
              onChange={(e) =>
                handlePreferenceChange("timeRangeEnd", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Buffer Time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Buffer Time
        </label>
        <select
          value={preferences.bufferTime}
          onChange={(e) =>
            handlePreferenceChange("bufferTime", parseInt(e.target.value))
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {BUFFER_TIME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Time to add before and after the meeting
        </p>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Timezone
        </label>
        <input
          type="text"
          value={preferences.timezone}
          onChange={(e) => handlePreferenceChange("timezone", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., America/New_York"
        />
        <p className="mt-1 text-xs text-gray-500">
          Detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </div>

      {/* Exclude Weekends */}
      <div className="flex items-center">
        <input
          id="exclude-weekends"
          type="checkbox"
          checked={preferences.excludeWeekends}
          onChange={(e) =>
            handlePreferenceChange("excludeWeekends", e.target.checked)
          }
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label
          htmlFor="exclude-weekends"
          className="ml-2 block text-sm text-gray-700"
        >
          Exclude weekends
        </label>
      </div>

      {/* Excluded Dates */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Exclude Specific Dates
        </label>
        <div className="flex space-x-2 mb-2">
          <input
            type="date"
            value={newExcludedDate}
            onChange={(e) => setNewExcludedDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={addExcludedDate}
            disabled={!newExcludedDate}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        {preferences.excludedDates.length > 0 && (
          <div className="space-y-1">
            {preferences.excludedDates.map((date) => (
              <div
                key={date}
                className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded text-sm"
              >
                <span>{formatDate(date)}</span>
                <button
                  onClick={() => removeExcludedDate(date)}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analyze Button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Analyzing...
            </>
          ) : (
            "Find Meeting Times"
          )}
        </button>
        <p className="mt-2 text-xs text-gray-500 text-center">
          This will analyze all connected calendars and uploaded files
        </p>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">
          Current Settings
        </h4>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Duration:</dt>
            <dd className="text-gray-900">
              {
                DURATION_OPTIONS.find(
                  (opt) => opt.value === preferences.duration
                )?.label
              }
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Time Range:</dt>
            <dd className="text-gray-900">
              {preferences.timeRangeStart} - {preferences.timeRangeEnd}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Buffer:</dt>
            <dd className="text-gray-900">
              {
                BUFFER_TIME_OPTIONS.find(
                  (opt) => opt.value === preferences.bufferTime
                )?.label
              }
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Weekends:</dt>
            <dd className="text-gray-900">
              {preferences.excludeWeekends ? "Excluded" : "Included"}
            </dd>
          </div>
          {preferences.excludedDates.length > 0 && (
            <div className="flex justify-between">
              <dt className="text-gray-600">Excluded Dates:</dt>
              <dd className="text-gray-900">
                {preferences.excludedDates.length} date
                {preferences.excludedDates.length !== 1 ? "s" : ""}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
