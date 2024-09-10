import csv
import os
from shutil import copy
import hashlib

rows = []

def modifyUPRN(UPRN):
    start = UPRN[:6]
    end = UPRN[-6:]
    end_new = []
    for i in range(len(end)):
        end_new.append(str(10-int(end[i])) if int(end[i]) > 0 else end[i])
    scrambled = start + "".join(end_new)
    return hashlib.sha256(scrambled.encode("utf-8")).hexdigest()

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

with open('u', 'w', newline='') as csvfile:
    writer = csv.writer(csvfile, delimiter=',', quotechar='"')
    writer.writerows(rows)

path = os.path.realpath(open("u").name)
greatgrandparent = os.path.dirname(os.path.dirname(os.path.dirname(path)))

copy("u",greatgrandparent+"/u")
copy("u",greatgrandparent+"/public/u")

print("'u' has been added to both the root directory and the /public/ directory")

os.remove("u")