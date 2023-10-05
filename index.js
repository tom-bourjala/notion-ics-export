require("dotenv").config();

const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_KEY });

async function getMeetingsPagesWithDates() {
    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({
        database_id: databaseId,
    });
    return response.results.filter((page) => page.properties["Event time"] !== undefined);
};

async function getToDoFromPage(pageId) {
    const response = await notion.blocks.children.list({
        block_id: pageId,
    });
    let toDos = response.results.filter((block) => block.type === "to_do");
    toDos = toDos.filter((block) => block.to_do.rich_text[0] !== undefined);
    toDos = toDos.map((block) => `${block.to_do.checked ? '☑' : '☐' } ${block.to_do.rich_text[0].plain_text}`);
    return toDos;
}

const MeetingDetails = {
    "Name": "",
    "Id": "",
    "Attendees": [],
    'Event time': {
        "start": "",
        "end": ""
    },
    "URL": "",
    "Plan": "",
}

async function getMeetingDetailsFromPage(pageId) {
    let meetingDetails = MeetingDetails;
    const response = await notion.pages.retrieve({
        page_id: pageId,
    });
    meetingDetails["Id"] = pageId;
    meetingDetails["Name"] = response.properties.Name.title[0].plain_text;
    meetingDetails["Attendees"] = response.properties.Attendees.people.map((attendee) => attendee.name);
    meetingDetails["Event time"]["start"] = response.properties["Event time"].date.start;
    meetingDetails["Event time"]["end"] = response.properties["Event time"].date.end;
    meetingDetails["URL"] = response.url;
    const toDos = await getToDoFromPage(pageId);
    meetingDetails["Plan"] = toDos.join("\\n");
    return meetingDetails;
}

function formatICSDate(date) {
    let yyyy = date.getUTCFullYear();
    let mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    let dd = String(date.getUTCDate()).padStart(2, '0');
    let hh = String(date.getUTCHours()).padStart(2, '0');
    let min = String(date.getUTCMinutes()).padStart(2, '0');
    let ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

async function getICSEventFromMeetingDetails(meetingDetails) {
    let ICSEvent = "BEGIN:VEVENT\n";
    ICSEvent += `SUMMARY:${meetingDetails["Name"]}\n`;
    ICSEvent += `UID:${meetingDetails["Id"]}@notion_meetings\n`;

    let startTimestamp = new Date(meetingDetails["Event time"]["start"]).getTime();
    let endTimestamp;
    if(meetingDetails["Event time"]["end"] !== null)
        endTimestamp = new Date(meetingDetails["Event time"]["end"]).getTime();
    else{
        // If end time is not specified, assume it is 2 hour after start time
        endTimestamp = startTimestamp + 2 * 60 * 60 * 1000;
    }

    const formatedStartTimestamp = formatICSDate(new Date(startTimestamp));
    const formatedEndTimestamp = formatICSDate(new Date(endTimestamp));
    ICSEvent += `DTSTAMP:${formatICSDate(new Date())}\n`;
    ICSEvent += `DTSTART:${formatedStartTimestamp}\n`;
    ICSEvent += `DTEND:${formatedEndTimestamp}\n`;
    ICSEvent += `URL:${meetingDetails["URL"]}\n`;
    let description = ``;
    if(meetingDetails["Plan"].length > 0)
        description += `${meetingDetails["Plan"]}`;
    if(description.length > 75){
        description = description.substring(0, 70);
        description += "...";
    }
    ICSEvent += `DESCRIPTION:${description}\n`;
    ICSEvent += `END:VEVENT\n`;
    return ICSEvent;
}

async function constructICSFile() {
    const pages = await getMeetingsPagesWithDates();
    let ICSFile = "BEGIN:VCALENDAR\n";
    ICSFile += "VERSION:2.0\n";
    ICSFile += "PRODID:-//Notion Meetings//EN\n";
    ICSFile += "CALSCALE:GREGORIAN\n";
    for (const page of pages) {
        const meetingDetails = await getMeetingDetailsFromPage(page.id);
        if(!meetingDetails)
            continue;
        const ICSEvent = await getICSEventFromMeetingDetails(meetingDetails);
        ICSFile += ICSEvent
    }
    ICSFile += "END:VCALENDAR\n";
    return ICSFile;
}


// schedule tasks to be run every 30 minutes
const cron = require("node-cron");

async function updateFile(){
    const ICSFile = await constructICSFile();
    const fs = require('fs');
    fs.writeFile("ICS/meetings.ics", ICSFile, function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("ICS file updated.");
    });
}

cron.schedule("*/30 * * * *", async () => {
    console.log("Updating ICS file...");
    await updateFile();
});

console.log("Schedule initiated");

console.log("Updating ICS file...");
updateFile();