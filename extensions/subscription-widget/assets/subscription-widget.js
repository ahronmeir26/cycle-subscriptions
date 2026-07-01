(function () {
  document.querySelectorAll(".subscription-widget").forEach(function (widget) {
    if (widget.dataset.bound === "true") return;
    widget.dataset.bound = "true";

    var form =
      widget.closest('form[action*="/cart/add"]') ||
      document.querySelector('form[action*="/cart/add"]');
    if (!form) return;

    function syncHidden(value) {
      var hidden = form.querySelector('input[name="selling_plan"]');
      if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = "selling_plan";
        form.appendChild(hidden);
      }
      hidden.value = value || "";
      hidden.disabled = !value;
    }

    widget.addEventListener("change", function (event) {
      var target = event.target;
      if (target && target.name === "subscription_widget_plan") {
        syncHidden(target.value);
      }
    });

    var checked = widget.querySelector(
      'input[name="subscription_widget_plan"]:checked',
    );
    if (checked) syncHidden(checked.value);
  });
})();
