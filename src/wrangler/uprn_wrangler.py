import csv

rows = []

def modifyUPRN(UPRN):
    start = UPRN[:6]
    end = UPRN[-6:]
    end_new = []
    for i in range(len(end)):
        end_new.append(str(10-int(end[i])) if int(end[i]) > 0 else end[i])
    scrambled = start + "".join(end_new)
    return scrambled

with open("UPRNlookup_orig.csv", newline='', encoding="utf-8") as csvfile:
    reader = csv.reader(csvfile, delimiter=',', quotechar='"')
    rows = []
    hasSkippedHeader = False
    for row in reader:
        if not hasSkippedHeader:
            rows.append(row)
            hasSkippedHeader = True
            continue
        row[0] = modifyUPRN(row[0])
        rows.append(row)

with open('UPRNlookup.csv', 'w', newline='') as csvfile:
    writer = csv.writer(csvfile, delimiter=',', quotechar='"')
    writer.writerows(rows)