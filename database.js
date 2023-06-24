const fs = require("fs");
const process = require("process");
const axios = require("axios");

let kanjidb = undefined;
try {
    kanjidb = require("./kanjis.json");
    console.log("KanjiDB found");
} catch {
    fs.writeFileSync("kanjis.json", "[]");
    kanjidb = require("./kanjis.json");
    console.log("KanjiDB created");
}

const localKanjis = [];
for(const kanji in kanjidb) {
    localKanjis.push(kanji);
}

const apiHost = "https://kanjiapi.dev/v1";

async function getAllKanji() {
    const urls = [
        "/kanji/joyo",
        "/kanji/jouyou",
        "/kanji/jinmeiyo",
        "/kanji/jinmeiyou",
        "/kanji/grade-1",
        "/kanji/grade-2",
        "/kanji/grade-3",
        "/kanji/grade-4",
        "/kanji/grade-5",
        "/kanji/grade-6",
        "/kanji/grade-8",
        "/kanji/all",
    ]

    const promises = [];
    for(const url of urls) {
        const promise = axios
            .get(`${apiHost}${url}`)
            .then(res => res.data)
            .catch(() => [])
        promises.push(promise);
    }

    const results = await Promise.all(promises);
    const parsedResults = [];
    for(const result of results) {
        parsedResults.push(...result);
    }

    const filteredResults = parsedResults.filter((item, index) => parsedResults.indexOf(item) === index);
    console.log(filteredResults)
    if(!filteredResults) throw new Error("Cannot Gather Kanji");
    return filteredResults;
}

async function getKanjiDetail(kanji) {
    // process.stdout.write(`Gathering Details of ${kanji} : \r`);
    // Use Local if Available
    if(localKanjis.includes(kanji)) {
        process.stdout.write(`Gathering Details of ${kanji} : Done Using Local!                               \r`);
        return kanjidb[kanji];
    }

    // process.stdout.write(`Gathering Details of ${kanji} : parsing grade, jlpt level, reading                               \r`);
    const detail = await axios
        .get(`${apiHost}/kanji/${kanji}`)
        .then(res => res.data)
        .catch(() => null);
    
    // process.stdout.write(`Gathering Details of ${kanji} : parsing meanings, pronounciation, writting variants                               \r`);
    const usages = await axios
        .get(`${apiHost}/words/${kanji}`)
        .then(res => res.data)
        .catch(() => null);
    
    if(!detail) return {}
    
    if("unicode" in detail) delete detail.unicode;

    const filteredUsages = [];
    if(usages) {
        for(let k=0; k<usages.length; k++) {
            if(usages[k].variants.length > 1) continue;
    
            for(let i=0; i<usages[k].variants.length; i++) {
                if("priorities" in usages[k].variants[i]) delete usages[k].variants[i].priorities;
            }
    
            const newMeanings = [];
            for(let i=0; i<usages[k].meanings.length; i++) {
                newMeanings.push(...usages[k].meanings[i].glosses);
            }
    
            usages[k].meanings = newMeanings;
            filteredUsages.push(usages[k]);
        }
    }

    detail["usages"] = filteredUsages;

    // process.stdout.write(`Gathering Details of ${kanji} : Done Using Online!                                                    \n`);
    return detail;
}

async function gatherAllKanjiOnline() {
    const allKanji = await getAllKanji();
    const allKanjiCount = allKanji.length;
    const detailedKanji = {};

    // Progress Bar Animation
    let detailedKanjiCount = 0;
    let detailingQueueCount = 0;
    const loadingAnimPreset = ["-", "\\", "|", "/"];
    let animLoading = 0;
    let delayLoading = 0;

    // Interval Setter
    const intervalId = setInterval(async () => {
        const s1 = `Queue: ${detailingQueueCount.toString().padStart(4, " ")}`;
        const s2 = `${detailedKanjiCount.toString().padStart(allKanjiCount.toString().length, " ")}/${allKanjiCount} Processed`;

        const realPercent = detailedKanjiCount / allKanjiCount;
        const progressBarLength = 20;
        let progressbar = "";
        for(let i=0; i<progressBarLength; i++) {
            if(Math.ceil((i/(progressBarLength-1)) * 100000) < Math.ceil(realPercent * 100000)) {
                progressbar += "█";
            } else {
                progressbar += "▁";
            }
        }

        const s3 = loadingAnimPreset[animLoading];
        delayLoading++;
        if(delayLoading >= 100) {
            delayLoading = 0;
            animLoading++;
        }
        if(animLoading >= loadingAnimPreset.length) animLoading = 0;
        process.stdout.write(`\r${s1} | ${s2} | ${progressbar} ${s3} ${(realPercent * 100).toFixed(2).toString().padStart(3, " ")}%             \r`);
    }, 1);
    while(allKanji.length > 1) {
        const promises = [];
        for(let i=0; i<50; i++) { // limit promises to 10 request only
            const targetKanji = allKanji.pop(0);
            if(!targetKanji) break;
            const promise = getKanjiDetail(targetKanji)
                .then(retval => {
                    detailedKanji[targetKanji] = retval;
                    detailedKanjiCount++;
                    detailingQueueCount--;
                });
            detailingQueueCount++;
            promises.push(promise);
        }
        await Promise.all(promises);
        fs.unlinkSync("kanjis.json");
        fs.writeFileSync("kanjis.json", JSON.stringify(detailedKanji, null, 2));
    }

    fs.unlinkSync("kanjis.json");
    fs.writeFileSync("kanjis.json", JSON.stringify(detailedKanji));
    KANJIMEMO = detailedKanji;

    // Make Sure to delete interval
    clearInterval(intervalId);

    return detailedKanji;
}

async function getAllJLPTKanji(level = 5) {
    if(level < 1 || level > 5) throw new Error("JLPT Level exist only from 1 to 5");

    const leveledKanji = []
    const kanjis = await gatherAllKanjiOnline();
    for(const kanji in kanjis) {
        if(kanjis[kanji].jlpt == null) continue;
        if(kanjis[kanji].jlpt == level) {
            leveledKanji.push(kanjis[kanji]);
        }
    }

    return leveledKanji
}

async function main() {
    // await gatherData()
    // console.log(JSON.stringify(await jlptKanji(), null, 2));

    // const kanji = await gatherAllKanjiOnline();
    // console.log(kanji);

    const jlpt = await getAllJLPTKanji(4);
    console.log(jlpt)
}


main();