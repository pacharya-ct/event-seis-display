// Draw multi column layout of streams with checkboxes to allow more than one selection 

class StreamMultiSelector extends HTMLElement {
  static observedAttributes = ["columns", "height", "width", "bgcolor", "buttontxt"];
  constructor() {
    super();
    this.streams = [];
    this.selected_streams = new Set(); // Resume here.
    const shadow = this.attachShadow({ mode: "open" });
    this.doneAction = null;
    this.drawElement(shadow);
  }

  get columns() {
    const ks = this.hasAttribute("columns")? this.getAttribute("columns"): 8;
    return parseInt(ks);
  }
  set columns(val) {
    this.setAttribute("columns", `${val}`);
  }
  get buttontxt() {
    return this.hasAttribute("buttontxt")? this.getAttribute("buttontxt"): "Update Display";
  }

  drawElement(shadow) {
    const that = this;
    while (shadow.firstChild) {
      shadow.removeChild(shadow.lastChild);
    }
    const details = document.createElement("details");
    const label = document.createElement("summary");
    label.textContent = "Channels:";
    const wrapper = document.createElement("div");
    wrapper.className = 'stream-list-div';
    details.appendChild(label);
    details.appendChild(wrapper);

    this.streams.forEach((c) => {
      let nslcStr = c.key.split('/')[0];
      let chan = nslcStr.replaceAll('_', '.');
      const chkBox = document.createElement("input");
      chkBox.type = "checkbox";
      chkBox.id = nslcStr;
      chkBox.className = "cls-chk-sncl";
      if (that.selected_streams.has(nslcStr)) {
        chkBox.checked = true;
      }

      const chkLabel = document.createElement("label");
      chkLabel.htmlFor = chkBox.id;
      chkLabel.textContent = chan;
      chkLabel.className = 'cls-chk-sncl-label'

      chkBox.addEventListener("change", function (event){
        if (chkBox.checked) {
          that.selected_streams.add(this.id);
        } else {
          that.selected_streams.delete(this.id);
        }
      });
      const chkBoxLabel = document.createElement("chk-label");
      chkBoxLabel.appendChild(chkBox);
      chkBoxLabel.appendChild(chkLabel);
      wrapper.appendChild(chkBoxLabel);
    });

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.id = "but-chan-sel";
    doneButton.value = "display";
    doneButton.innerText = `${that.buttontxt}`;
    doneButton.addEventListener("click", function(event) {
      let selStreams = that.getSelectedStreams();
      that.doneAction(selStreams);
      details.open = false;
    })
    wrapper.appendChild(doneButton);

    const style = document.createElement("style");
    // Define style details using updateStyle, so user can override that if they wish to.
    shadow.appendChild(style);
    shadow.appendChild(details);
    that.updateStyle();
  }
  setStreamStats(streams) {
    this.streams = streams;
    this.drawElement(this.shadowRoot);
  }
  setSelectedStreams(selStreams) {
    // selStreams is any iterable.
    // Save it to selected_streams which is a Set

    selStreams.forEach((stream) => {
      this.selected_streams.add (stream);
    })
  }
  getSelectedStreams() {
    return this.selected_streams;
  }
  updateStyle() {
  const shadow = this.shadowRoot;
  shadow.querySelector("style").textContent = `
    div.stream-list-div {width: ${this.getAttribute("width")};
      height: ${this.getAttribute("height")};
      background-color: ${this.getAttribute("bgcolor")};
      column-count:${this.columns};
    }
    details div.stream-list-div label {margin-right:1.5em;}
    details div.stream-list-div chk-label {display:inline-block; break-inside:avoid;}    
  `;
  }
  setDoneAction(callback) {
    this.doneAction = callback;
  }
  attributeChangedCallback(name, oldValue, newValue) {
    this.updateStyle();
  }
}

customElements.define("stream-multi-selector", StreamMultiSelector);
