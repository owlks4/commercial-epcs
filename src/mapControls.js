import { rerenderDatapoints, loadStatsIntoPanel } from "./mapDataRender.js";

class MappableFactor {
    constructor(displayName, internalName, colScaleReference){
      this.displayName = displayName;
      this.internalName = internalName;
      this.colScaleReference = colScaleReference;
      this.checkedSubBoxes = {};
      this.categoricTooltipTexts = null

      if (this.colScaleReference != null){
        this.categoricTooltipTexts = {};
        Object.keys(this.colScaleReference).forEach(categoricValue => {
          this.categoricTooltipTexts[categoricValue] = this.displayName+": "+categoricValue;
        });
      }
    }

    getColorForValue(value){
      if (typeof value == "string"){
        let col = this.colScaleReference[value];
        if (col == null){
          alert("Unhandled "+this.internalName+" value: "+value);
          return null;
        } else {
          return col;
        }
      } else {
        alert("Continuous legend elements not yet implemented");
      }
    }
}

let EPCbandColours = {
  "A+":"rgb(87,127,247)","A":"rgb(4,134,86)","B":"rgb(26,175,91)","C":"rgb(141,197,62)","D":"rgb(253,204,3)",
  "E":"rgb(249,172,100)", "F":"rgb(242,138,32)", "G":"rgb(237,28,57)", "INVALID!":"rgb(0,0,0)"
}

let fuels = {
  "Biogas":"#538f53",
  "Biomass":"#1f5e1f",
  "District Heating":"#910038",
  "Dual Fuel Appliances (Mineral + Wood)":"#b05510",
  "Grid Displaced Electricity":"#2c60db",
  "Grid Supplied Electricity":"#e0d612",
  "LPG":"#6e6760",
  "Natural Gas":"#9e9e9e",
  "Oil":"#1f1c1a",
  "Other":"#7a28b5",
  "Smokeless Fuel (inc Coke)":"#547987",
  "Waste Heat":"#a6178c",
}

let mappableFactors = [
  new MappableFactor("None (default to blue)","NONE",null),
  new MappableFactor("EPC band","ASSET_RATING_BAND",EPCbandColours),
  new MappableFactor("Main heating fuel","MAIN_HEATING_FUEL",fuels)
];

function composeAddress(cert){
  let addr = ""

  if (cert.ADDRESS1 != ""){
    addr += cert.ADDRESS1+" ";
  }
  if (cert.ADDRESS2 != ""){
    addr += cert.ADDRESS2+" ";
  }
  if (cert.ADDRESS3 != ""){
    addr += cert.ADDRESS3+" ";
  }
  if (cert.POSTCODE != ""){
    addr += cert.POSTCODE;
  }
  return addr.trim();
}

let FactorSelectControl = L.Control.extend({ 
    _container: null,
    options: {position: 'topright', },

    onAdd: function (map) {
      var megaDiv = L.DomUtil.create('div');
      let div = document.createElement("div");
      div.className = "control-panel-white";
      let title = document.createElement("div");
      title.innerHTML = "<strong>Datapoint colour</strong>";
      div.appendChild(title);

      mappableFactors.forEach((factor,index) => {
        factor.radioButton = document.createElement("input");
        factor.radioButton.type = "radio";        
        factor.radioButton.id = factor.internalName;
        factor.radioButton.setAttribute("name","mappableFactorsRadioButtons")
        factor.radioButton.disabled = true;
        if (index == 0){
          factor.radioButton.checked = true;
        }
        factor.radioButton.oninput = (e)=>{
            if (factor.internalName == "NONE"){
              this.closeAccordion();
            }
            else if (e.target.checked){
              this.openAccordion(factor);
            }
            rerenderDatapoints();
        }
        let label = document.createElement("label");
        label.innerText = factor.displayName;
        label.setAttribute("for",factor.radioButton.id);
        div.appendChild(factor.radioButton);
        div.appendChild(label);
        div.appendChild(document.createElement("br"));      
      });

      this.accordion = document.createElement("div");
      this.accordion.className = "control-panel-white accordion";

      megaDiv.appendChild(div);
      megaDiv.appendChild(this.accordion);
      this._div = megaDiv;
      L.DomEvent.disableClickPropagation(this._div);
      return this._div;
    },

    openAccordion(factor){
      this.accordion.innerHTML = "";
      let legendTitle = document.createElement("span");
      legendTitle.innerHTML = "<strong>Legend</strong><br>"
      this.accordion.appendChild(legendTitle);

      Object.keys(factor.colScaleReference).forEach((key)=>{
        this.accordion.appendChild(makeLegendCheckbox(key, factor.colScaleReference[key], factor));
      });

      this.accordion.style = "max-height:fit-content;";
    },

    closeAccordion(){
      this.accordion.innerHTML = "";
      this.accordion.style = "";
    }
});

function makeLegendCheckbox(labelText, color, factor){
    let div = document.createElement("div");
    div.style="display:flex;margin-bottom:0.15em;"
  
    factor.checkedSubBoxes[labelText] = true;
  
    let checkbox = document.createElement("span");
    checkbox.className = "legend-checkbox checked";
    checkbox.checked = true;
    checkbox.style = "background-color:"+color;
    checkbox.innerText = "✔";
    div.onclick = (e) => {
      if (checkbox.className.includes("checked")){
        checkbox.className = "legend-checkbox"; //then disable it
        checkbox.style = "";
        factor.checkedSubBoxes[labelText] = false;      
      } else {
        checkbox.className = "legend-checkbox checked"; //then enable it
        checkbox.style = "background-color:"+color;
        factor.checkedSubBoxes[labelText] = true;
      }
      rerenderDatapoints();
    };
    let labelDiv = document.createElement("div");
    labelDiv.innerText = labelText;
    labelDiv.style="user-select:none;width:fit-content;margin-left:0.35em";
    div.appendChild(checkbox);
    div.appendChild(labelDiv);
    return div;
}

let UngeolocatedResultsControl = L.Control.extend({ 
    _container: null,
    options: {position: 'bottomright', },

    onAdd: function (map) {
      var megaDiv = L.DomUtil.create('div');
      let div = document.createElement("div");
      div.className = "control-panel-white";
      div.style = "max-width:unset;"
      let title = document.createElement("div");
      title.style = "white-space:nowrap;"
      title.innerHTML = "<strong>Additional filter results that could not be geolocated:</strong>";
      div.appendChild(title);
      let listParent = document.createElement("div");
      listParent.className = "control-panel-white";
      listParent.style="max-width:unset;padding-top:0.25em;padding-bottom:0.75em;"
      this.list = document.createElement("ul");
      this.list.id = "ungeolocated-results-list";
      listParent.appendChild(this.list);
      megaDiv.appendChild(div);
      megaDiv.appendChild(listParent);
      this._div = megaDiv;
      L.DomEvent.disableClickPropagation(this._div);
      L.DomEvent.disableScrollPropagation(this._div);
      return this._div;
    },

    update(ungeolocatedResults, factorToMap){
      if (ungeolocatedResults.length > 100){
        this.list.innerText = ungeolocatedResults.length +" results could not be geolocated (apply some filters first to see them in this list)";
      } else {
        this.list.innerHTML = "";
        this.list.scrollTop = 0;        
        if (factorToMap == null){
          ungeolocatedResults.sort((a,b)=>{return a.ADDRESS.localeCompare(b.ADDRESS)}); //sort alphabetically if there are no factor values involved
        } else {
          ungeolocatedResults.sort((a,b)=>{  //but if there are, sort by factor value
            let aVal = a[factorToMap.internalName];
            let bVal = b[factorToMap.internalName];    
            return aVal == bVal ? 0 : (aVal < bVal ? -1 : 1);
          });
        }
        ungeolocatedResults.forEach((cert) => {
          let li = document.createElement("li");
          li.className = "ungeolocatable-list-item"
          li.innerText = composeAddress(cert);
          if (factorToMap != null){
            let factorValue = cert[factorToMap.internalName];
            li.style = "background-color:"+factorToMap.getColorForValue(factorValue);
            li.title = factorToMap.displayName +": "+String(factorValue);
          }
          li.onclick = () => {loadStatsIntoPanel(cert,false);}
          this.list.appendChild(li);
        });
      }
    }
});

let factorSelectControl = new FactorSelectControl();
let ungeolocatedResultsControl = new UngeolocatedResultsControl();

function spawnMapControls(map){
    factorSelectControl.addTo(map);
    ungeolocatedResultsControl.addTo(map);
}

export {spawnMapControls, ungeolocatedResultsControl, mappableFactors, composeAddress}