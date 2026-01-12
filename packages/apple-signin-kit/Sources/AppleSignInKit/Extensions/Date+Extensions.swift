// Date+Extensions.swift
// Date utility extensions

import Foundation

// MARK: - Date Extensions

public extension Date {

    // MARK: - Comparison

    /// Returns true if the date is in the past
    var isPast: Bool {
        self < Date()
    }

    /// Returns true if the date is in the future
    var isFuture: Bool {
        self > Date()
    }

    /// Returns true if the date is today
    var isToday: Bool {
        Calendar.current.isDateInToday(self)
    }

    // MARK: - Time Intervals

    /// Seconds until this date (negative if in the past)
    var secondsFromNow: TimeInterval {
        timeIntervalSinceNow
    }

    /// Minutes until this date (negative if in the past)
    var minutesFromNow: Double {
        secondsFromNow / 60
    }

    /// Hours until this date (negative if in the past)
    var hoursFromNow: Double {
        minutesFromNow / 60
    }

    // MARK: - Formatting

    /// Format as ISO8601 string
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }

    /// Format as relative time string (e.g., "2 hours ago", "in 5 minutes")
    var relativeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: self, relativeTo: Date())
    }

    /// Format as short date string (e.g., "Jan 15, 2024")
    var shortDateString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: self)
    }

    /// Format as short time string (e.g., "3:45 PM")
    var shortTimeString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    // MARK: - Arithmetic

    /// Returns a new date by adding the specified number of seconds
    func adding(seconds: TimeInterval) -> Date {
        addingTimeInterval(seconds)
    }

    /// Returns a new date by adding the specified number of minutes
    func adding(minutes: Int) -> Date {
        adding(seconds: TimeInterval(minutes * 60))
    }

    /// Returns a new date by adding the specified number of hours
    func adding(hours: Int) -> Date {
        adding(seconds: TimeInterval(hours * 3600))
    }

    /// Returns a new date by adding the specified number of days
    func adding(days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: self) ?? self
    }
}

// MARK: - TimeInterval Extensions

public extension TimeInterval {

    /// Time interval for specified seconds
    static func seconds(_ value: Double) -> TimeInterval {
        value
    }

    /// Time interval for specified minutes
    static func minutes(_ value: Double) -> TimeInterval {
        value * 60
    }

    /// Time interval for specified hours
    static func hours(_ value: Double) -> TimeInterval {
        value * 3600
    }

    /// Time interval for specified days
    static func days(_ value: Double) -> TimeInterval {
        value * 86400
    }
}

// MARK: - ISO8601 Parsing

public extension String {

    /// Parse ISO8601 date string
    var iso8601Date: Date? {
        ISO8601DateFormatter().date(from: self)
    }
}
