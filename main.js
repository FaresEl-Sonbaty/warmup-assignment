const fs = require("fs");

//My own helper functions:

//1- time converters to and from seconds format with am/pm

function timeToSeconds(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes, seconds] = time.split(':').map(Number);
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString()}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

//2- time converters to and from seconds format without am/pm

function parseTimeStr(timeStr) {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToHours(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString()}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}


// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startT = timeToSeconds(startTime);
    let endT = timeToSeconds(endTime);
    
    if (endT < startT) {
        endT += 24 * 3600;
    }
    
    const duration = endT - startT;
    return secondsToTime(duration);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const startT = timeToSeconds(startTime);
    let endT = timeToSeconds(endTime);
    
    if (endT < startT) {
        endT += 24 * 3600;
    }
    
    const deliveryStart = 8 * 3600; 
    const deliveryEnd = 22 * 3600; 
    
    let idleT = 0;
    
    if (startT < deliveryStart) {
        idleT += Math.min(deliveryStart, endT) - startT;
    }
    if (endT > deliveryEnd) {
        idleT += endT - Math.max(deliveryEnd, startT);
    }
    
    return secondsToTime(idleT);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftT = parseTimeStr(shiftDuration);
    const idleT = parseTimeStr(idleTime);
    const activeT = shiftT - idleT;
    return secondsToTime(activeT);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const activeT = parseTimeStr(activeTime);
    const [year, month, day] = date.split('-').map(Number);
    const isEid = year === 2025 && month === 4 && day >= 10 && day <= 30;
    const quota = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;
    
    return activeT >= quota;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let fileContent = fs.readFileSync(textFile, 'utf8');
    let lines = fileContent.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    const duplicateExists = dataLines.some(line => {
        const [driverID, , date] = line.split(',');
        return driverID === shiftObj.driverID && date === shiftObj.date;
    });
    
    if (duplicateExists) {
        return {};
    }
    
    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleT = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeT = getActiveTime(shiftDuration, idleT);
    const metQuotaValue = metQuota(shiftObj.date, activeT);
    
    const newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startT,
        endTime: shiftObj.endT,
        shiftDuration: shiftDuration,
        idleTime: idleT,
        activeTime: activeT,
        metQuota: metQuotaValue,
        hasBonus: false
    };
    
    let insertIndex = dataLines.length;
    
    for (let i = dataLines.length - 1; i >= 0; i--) {
        const [driverID] = dataLines[i].split(',');
        if (driverID === shiftObj.driverID) {
            insertIndex = i + 1;
            break;
        }
    }
    
    const newLine = `${newRecord.driverID},${newRecord.driverName},${newRecord.date},${newRecord.startTime},${newRecord.endTime},${newRecord.shiftDuration},${newRecord.idleTime},${newRecord.activeTime},${newRecord.metQuota},${newRecord.hasBonus}`;
    const newDataLines = [
        ...dataLines.slice(0, insertIndex),
        newLine,
        ...dataLines.slice(insertIndex)
    ];
    
    fs.writeFileSync(textFile, [header, ...newDataLines].join('\n'));
    
    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    let fileContent = fs.readFileSync(textFile, 'utf8');
    let lines = fileContent.split('\n');
    const header = lines[0];
    
    const updatedLines = lines.map((line, index) => {
        if (index === 0) 
            return line; 

        const columns = line.split(',');
        if (columns.length >= 10 && columns[0] === driverID && columns[2] === date) {
            columns[9] = newValue.toString();
            return columns.join(',');
        }
        return line;
    });
    fs.writeFileSync(textFile, updatedLines.join('\n'));
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let fileContent = fs.readFileSync(textFile, 'utf8');
    let lines = fileContent.split('\n');
    const targetMonth = parseInt(month, 10).toString();
    let driverFound = false;
    let bonusCount = 0;
    
    for (let i = 1; i < lines.length; i++) { 
        const line = lines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',');
        if (columns[0] === driverID) {
            driverFound = true;
            const [, , date] = columns;
            const recordMonth = date.split('-')[1];
            if (parseInt(recordMonth, 10).toString() === targetMonth) {
                if (columns[9] && columns[9].toLowerCase() === 'true') {
                    bonusCount++;
                }
            }
        }
    }
    
    return driverFound ? bonusCount : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let fileContent = fs.readFileSync(textFile, 'utf8');
    let lines = fileContent.split('\n');
    const monat = month.toString().padStart(2, '0');
    let totalT = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) continue;
        const columns = line.split(',');

        if (columns[0] === driverID) {
            const [, , date] = columns;
            const recordMonth = date.split('-')[1];
            
            if (recordMonth === monat) {
                const activeTime = columns[7];
                totalT += parseTimeStr(activeTime);
            }
        }
    }
    
    return secondsToHours(totalT);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n');
    let dayOff = null;
    for (let i = 0; i < rateLines.length; i++) {
        const line = rateLines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',');
        if (columns[0] === driverID) {
            dayOff = columns[1];
            break;
        }
    }
    
    if (!dayOff) 
        return "00:00:00";
    
    const shiftContent = fs.readFileSync(textFile, 'utf8');
    const shiftLines = shiftContent.split('\n');
    
    const monat = month.toString().padStart(2, '0');
    let workingDays = new Set();
    let eidDays = new Set();
    
    for (let i = 1; i < shiftLines.length; i++) {
        const line = shiftLines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',');
        if (columns[0] === driverID) {
            const date = columns[2];
            const [year, recordMonth, day] = date.split('-');
            
            if (recordMonth === monat) {
                workingDays.add(parseInt(day, 10));
                
                if (year === '2025' && recordMonth === '04' && parseInt(day, 10) >= 10 && parseInt(day, 10) <= 30) {
                    eidDays.add(parseInt(day, 10));
                }
            }
        }
    }
    
    const Quota = 8 * 3600 + 24 * 60; 
    const eidQuota = 6 * 3600; 
    let requiredT = 0;
    workingDays.forEach(day => {
        if (eidDays.has(day)) {
            requiredT += eidQuota;
        } else {
            requiredT += Quota;
        }
    });

    requiredT -= bonusCount * 2 * 3600;
    if (requiredT < 0) 
        requiredT = 0;
    
    return secondsToHours(requiredT);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateContent = fs.readFileSync(rateFile, 'utf8');
    const rateLines = rateContent.split('\n');
    let basePay = 0;
    let tier = 0;
    
    for (let i = 0; i < rateLines.length; i++) {
        const line = rateLines[i].trim();
        if (!line) continue;
        
        const columns = line.split(',');
        if (columns[0] === driverID) {
            basePay = parseInt(columns[2], 10);
            tier = parseInt(columns[3], 10);
            break;
        }
    }
    
    const actualT = parseTimeStr(actualHours);
    const requiredT = parseTimeStr(requiredHours);

    if (actualT >= requiredT) {
        return basePay;
    }
    
    const missingT =  Math.floor((requiredT - actualT)/ 3600);  
    const allowances = {
        1: 50, 
        2: 20, 
        3: 10, 
        4: 3   
    };
    
    const allowance = allowances[tier] || 0;
    const billableMissingHours = Math.max(0, missingT - allowance);
    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableMissingHours * deductionRatePerHour;
    
    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
