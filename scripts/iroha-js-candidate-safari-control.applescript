-- Copyright 2026 Soramitsu Co., Ltd.
-- SPDX-License-Identifier: Apache-2.0

on listContains(theList, theValue)
    repeat with candidate in theList
        if (candidate as integer) is (theValue as integer) then return true
    end repeat
    return false
end listContains

on exactWindow(windowId, expectedUrl)
    tell application "Safari"
        if not (exists window id windowId) then error "owned Safari QA window no longer exists"
        set qaWindow to window id windowId
        set observedUrl to URL of current tab of qaWindow
        if observedUrl is not expectedUrl then error "owned Safari QA window URL changed"
        return qaWindow
    end tell
end exactWindow

on run argv
    if (count of argv) < 2 then error "usage: <open|read|close> <url> [window-id]"
    set operation to item 1 of argv
    set expectedUrl to item 2 of argv

    if operation is "open" then
        tell application "Safari"
            set previousWindowIds to id of every window
            make new document with properties {URL:expectedUrl}
            delay 0.1
            set createdWindowIds to {}
            set currentWindowIds to id of every window
            repeat with candidateId in currentWindowIds
                if not my listContains(previousWindowIds, candidateId) then set end of createdWindowIds to candidateId
            end repeat
            if (count of createdWindowIds) is not 1 then error "Safari did not create exactly one isolated QA window"
            set createdWindowId to item 1 of createdWindowIds
            set qaWindow to window id createdWindowId
            if URL of current tab of qaWindow is not expectedUrl then error "Safari QA window opened an unexpected URL"
            return createdWindowId as text
        end tell
    end if

    if (count of argv) is not 3 then error "read/close requires an owned window id"
    set windowIdText to item 3 of argv
    try
        set windowId to windowIdText as integer
    on error
        error "invalid owned Safari QA window id"
    end try

    if operation is "read" then
        set qaWindow to my exactWindow(windowId, expectedUrl)
        tell application "Safari" to return text of current tab of qaWindow
    end if

    if operation is "close" then
        set qaWindow to my exactWindow(windowId, expectedUrl)
        tell application "Safari" to close qaWindow
        return "closed"
    end if

    error "unknown Safari QA control operation"
end run
